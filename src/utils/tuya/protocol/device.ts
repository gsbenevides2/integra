import { EventEmitter } from "node:events";
import { Socket } from "node:net";
import { aesEcbDecrypt, aesEcbEncrypt, md5 } from "./crypto";
import {
    TuyaCommand,
    buildControlPayload,
    buildStatusPayload,
    buildVersionHeader,
    controlCommandFor,
    extractDps,
    needsVersionHeader,
    statusCommandFor,
} from "./commands";
import { decodeFrames, encodeFrame, type TuyaFrame } from "./frame";
import { negotiateSessionKey } from "./session";
import { TUYA_DEFAULT_PORT, type TuyaDps, type TuyaProtocolVersion, usesSessionKey } from "./types";

const VERSION_HEADER_BYTES = 15;
const MD5_SIGNATURE_BYTES = 16;
const REQUEST_TIMEOUT_MS = 5_000;
const CONNECT_TIMEOUT_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 10_000;

/** The data point ids a refresh asks for when the caller does not name any. */
const DEFAULT_REFRESH_DP_IDS = ["1", "2", "3", "4", "5", "6", "101", "102", "103", "104", "105"];

export interface TuyaLocalDeviceOptions {
    /** The Tuya device id, also called gwId. */
    id: string;
    /** The local key as shown by the Tuya IoT platform, used as raw ASCII bytes. */
    key: string;
    ip: string;
    version: TuyaProtocolVersion;
    port?: number;
}

interface PendingRequest {
    expect: Set<number>;
    resolve: (payload: Buffer) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class TuyaLocalDevice extends EventEmitter {
    private readonly options: TuyaLocalDeviceOptions;
    private readonly localKey: Buffer;

    private socket: Socket | null = null;
    private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    private seq = 1;
    /** The static local key, replaced by the session key once 3.4/3.5 has negotiated one. */
    private currentKey: Buffer;
    private pending: PendingRequest | null = null;
    private queue: Promise<unknown> = Promise.resolve();
    private heartbeat: ReturnType<typeof setInterval> | null = null;
    private connecting: Promise<void> | null = null;

    constructor(options: TuyaLocalDeviceOptions) {
        super();
        this.options = options;
        this.localKey = Buffer.from(options.key, "latin1");
        this.currentKey = this.localKey;
    }

    get version(): TuyaProtocolVersion {
        return this.options.version;
    }

    isConnected(): boolean {
        return this.socket !== null && !this.socket.destroyed;
    }

    /** Connects if needed, collapsing concurrent callers onto a single attempt. */
    async ensureConnected(): Promise<void> {
        if (this.isConnected()) return;
        this.connecting ??= this.connect().finally(() => {
            this.connecting = null;
        });
        return this.connecting;
    }

    async connect(): Promise<void> {
        this.teardown();

        const socket = new Socket();
        this.socket = socket;
        socket.setNoDelay(true);

        await new Promise<void>((resolve, reject) => {
            const onError = (error: Error) => {
                socket.destroy();
                reject(error);
            };
            socket.once("error", onError);
            socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
                onError(new Error(`Connection to ${this.options.ip} timed out`));
            });
            socket.connect(this.options.port ?? TUYA_DEFAULT_PORT, this.options.ip, () => {
                socket.setTimeout(0);
                socket.off("error", onError);
                resolve();
            });
        });

        socket.on("data", (chunk: Buffer) => this.onData(chunk));
        socket.on("error", (error) => this.emit("error", error));
        socket.on("close", () => {
            this.teardown();
            this.emit("disconnected");
        });

        if (usesSessionKey(this.options.version)) {
            const version = this.options.version as "3.4" | "3.5";
            this.currentKey = await negotiateSessionKey({
                version,
                localKey: this.localKey,
                request: (command, payload, expect) => this.send(command, payload, expect),
                send: async (command, payload) => {
                    await this.send(command, payload);
                },
            });
        }

        this.heartbeat = setInterval(() => {
            this.send(TuyaCommand.HEART_BEAT, Buffer.alloc(0), [TuyaCommand.HEART_BEAT]).catch(
                (error: unknown) => this.emit("error", error),
            );
        }, HEARTBEAT_INTERVAL_MS);

        this.emit("connected");
    }

    disconnect(): void {
        const socket = this.socket;
        this.teardown();
        socket?.destroy();
    }

    /** Reads the current data points with DP_QUERY (or DP_QUERY_NEW on 3.4/3.5). */
    async get(): Promise<TuyaDps> {
        await this.ensureConnected();

        const command = statusCommandFor(this.options.version);
        const payload = Buffer.from(
            JSON.stringify(buildStatusPayload(this.options.version, this.options.id)),
        );
        const response = await this.send(command, payload, [command, TuyaCommand.STATUS]);

        return extractDps(parseJson(response)) ?? {};
    }

    /**
     * Asks the device to re-report its data points. Some devices answer DP_QUERY with an
     * empty set and only publish state after an explicit refresh.
     */
    async refresh(dpIds?: string[]): Promise<TuyaDps> {
        await this.ensureConnected();

        const payload = Buffer.from(
            JSON.stringify({
                devId: this.options.id,
                uid: this.options.id,
                t: Math.floor(Date.now() / 1000),
                dpId: dpIds ?? DEFAULT_REFRESH_DP_IDS,
            }),
        );
        const response = await this.send(TuyaCommand.UPDATEDPS, payload, [
            TuyaCommand.UPDATEDPS,
            TuyaCommand.STATUS,
        ]);

        return extractDps(parseJson(response)) ?? {};
    }

    /** Writes data points with CONTROL (or CONTROL_NEW on 3.4/3.5). */
    async set(dps: TuyaDps): Promise<void> {
        await this.ensureConnected();

        const command = controlCommandFor(this.options.version);
        const payload = Buffer.from(
            JSON.stringify(buildControlPayload(this.options.version, this.options.id, dps)),
        );
        await this.send(command, payload, [command]);
    }

    /**
     * Serialises every exchange onto one in-flight request. Lamps see a handful of commands
     * per minute, so a queue is simpler — and far less error-prone — than correlating
     * responses by sequence number across firmware that does not always echo it back.
     */
    private send(command: number, payload: Buffer, expect?: number[]): Promise<Buffer> {
        const run = () => this.sendNow(command, payload, expect);
        const result = this.queue.then(run, run);
        this.queue = result.catch(() => undefined);
        return result;
    }

    private sendNow(command: number, payload: Buffer, expect?: number[]): Promise<Buffer> {
        const socket = this.socket;
        if (!socket || socket.destroyed) {
            return Promise.reject(new Error(`Device ${this.options.id} is not connected`));
        }

        const frame = encodeFrame({
            seq: this.seq++,
            command,
            payload: this.encodePayload(command, payload),
            key: usesSessionKey(this.options.version) ? this.currentKey : undefined,
            use6699: this.options.version === "3.5",
        });

        if (!expect || expect.length === 0) {
            socket.write(frame);
            return Promise.resolve(Buffer.alloc(0));
        }

        return new Promise<Buffer>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending = null;
                reject(
                    new Error(
                        `Device ${this.options.id} did not answer command 0x${command.toString(16)}`,
                    ),
                );
            }, REQUEST_TIMEOUT_MS);

            this.pending = { expect: new Set(expect), resolve, reject, timer };
            socket.write(frame, (error) => {
                if (!error) return;
                clearTimeout(timer);
                this.pending = null;
                reject(error);
            });
        });
    }

    private onData(chunk: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, chunk]);

        const key = usesSessionKey(this.options.version) ? this.currentKey : undefined;
        let decoded;
        try {
            decoded = decodeFrames(this.buffer, { key });
        } catch (error) {
            this.buffer = Buffer.alloc(0);
            this.emit("error", error);
            return;
        }

        this.buffer = decoded.rest;
        for (const frame of decoded.frames) this.onFrame(frame);
    }

    private onFrame(frame: TuyaFrame): void {
        let payload: Buffer;
        try {
            payload = this.decodePayload(frame.payload);
        } catch (error) {
            this.emit("error", error);
            return;
        }

        const pending = this.pending;
        if (pending?.expect.has(frame.command)) {
            clearTimeout(pending.timer);
            this.pending = null;
            pending.resolve(payload);
            return;
        }

        // Unsolicited STATUS frames are how the device pushes state changes made elsewhere,
        // such as from the Smart Life app or a physical switch.
        const dps = extractDps(parseJson(payload));
        if (dps) this.emit("data", dps);
    }

    private encodePayload(command: number, plain: Buffer): Buffer {
        const version = this.options.version;
        const withHeader = needsVersionHeader(version, command)
            ? Buffer.concat([buildVersionHeader(version), plain])
            : plain;

        // 3.5 encrypts inside the 6699 frame, so the payload stays in the clear here.
        if (version === "3.5") return withHeader;

        // 3.4 encrypts the version header along with the payload.
        if (version === "3.4") return aesEcbEncrypt(this.currentKey, withHeader);

        if (version === "3.3") {
            const encrypted = aesEcbEncrypt(this.localKey, plain);
            return needsVersionHeader(version, command)
                ? Buffer.concat([buildVersionHeader(version), encrypted])
                : encrypted;
        }

        // 3.1 leaves everything in the clear except CONTROL, which carries a base64 body
        // signed with a slice of an MD5 digest.
        if (command !== TuyaCommand.CONTROL) return plain;

        const encrypted = Buffer.from(aesEcbEncrypt(this.localKey, plain).toString("base64"));
        const signature = md5(
            Buffer.concat([
                Buffer.from("data="),
                encrypted,
                Buffer.from("||lpv="),
                Buffer.from("3.1"),
                Buffer.from("||"),
                this.localKey,
            ]),
        )
            .toString("hex")
            .slice(8, 24);

        return Buffer.concat([Buffer.from("3.1"), Buffer.from(signature), encrypted]);
    }

    private decodePayload(raw: Buffer): Buffer {
        if (raw.length === 0) return raw;
        const version = this.options.version;

        if (version === "3.4") return stripVersionHeader(decryptEcb(this.currentKey, raw));
        if (version === "3.5") return stripVersionHeader(raw);

        if (raw.subarray(0, 3).toString("latin1") === "3.1") {
            const body = raw.subarray(3 + MD5_SIGNATURE_BYTES);
            return decryptEcb(this.localKey, Buffer.from(body.toString("latin1"), "base64"));
        }

        return decryptEcb(this.localKey, stripVersionHeader(raw));
    }

    private teardown(): void {
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = null;

        if (this.pending) {
            clearTimeout(this.pending.timer);
            this.pending.reject(new Error(`Device ${this.options.id} disconnected`));
            this.pending = null;
        }

        this.socket?.removeAllListeners();
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this.seq = 1;
        this.currentKey = this.localKey;
    }
}

function stripVersionHeader(payload: Buffer): Buffer {
    const prefix = payload.subarray(0, 3).toString("latin1");
    if (
        prefix === "3.1" ||
        prefix === "3.2" ||
        prefix === "3.3" ||
        prefix === "3.4" ||
        prefix === "3.5"
    ) {
        return payload.subarray(VERSION_HEADER_BYTES);
    }
    return payload;
}

/** Devices answer some errors in the clear, so a failed decrypt falls back to the raw bytes. */
function decryptEcb(key: Buffer, payload: Buffer): Buffer {
    if (payload.length === 0 || payload.length % 16 !== 0) return payload;
    try {
        return aesEcbDecrypt(key, payload);
    } catch {
        return payload;
    }
}

function parseJson(payload: Buffer): unknown {
    if (payload.length === 0) return null;
    try {
        return JSON.parse(payload.toString("utf8"));
    } catch {
        return null;
    }
}
