import { createSocket, type Socket } from "node:dgram";
import { aesEcbDecrypt, md5 } from "./crypto";
import { decodeFrames } from "./frame";
import { isTuyaProtocolVersion, type TuyaProtocolVersion } from "./types";

/** Every Tuya device broadcasts with this same well-known key. */
const UDP_KEY = md5("yGAdlopoPVldABfn");

const DISCOVERY_PORTS = [6666, 6667] as const;
const PREFIX_6699 = Buffer.from([0x00, 0x00, 0x66, 0x99]);

export interface DiscoveredDevice {
    deviceId: string;
    ip: string;
    version: TuyaProtocolVersion | null;
    productKey: string | null;
    /** False when the device broadcasts that it is not yet paired. */
    active: boolean;
    discoveredAt: Date;
}

/**
 * Listens for the UDP broadcast that every Tuya device emits every few seconds. It reveals
 * the device id, its current IP and its protocol version — but never the local key.
 */
export async function listenForDevices(durationMs: number): Promise<DiscoveredDevice[]> {
    const found = new Map<string, DiscoveredDevice>();
    const sockets: Socket[] = [];

    await Promise.all(
        DISCOVERY_PORTS.map(async (port) => {
            const socket = createSocket({ type: "udp4", reuseAddr: true });
            socket.on("message", (message) => {
                const device = parseBroadcast(message);
                if (device) found.set(device.deviceId, device);
            });
            // A port already taken by another listener must not sink the whole sweep.
            socket.on("error", () => socket.close());

            await new Promise<void>((resolve) => {
                socket.once("error", () => resolve());
                socket.bind(port, () => resolve());
            });
            sockets.push(socket);
        }),
    );

    try {
        await new Promise((resolve) => setTimeout(resolve, durationMs));
    } finally {
        for (const socket of sockets) {
            try {
                socket.close();
            } catch {
                // Already closed by its own error handler.
            }
        }
    }

    return [...found.values()];
}

function parseBroadcast(message: Buffer): DiscoveredDevice | null {
    const is6699 = message.subarray(0, 4).equals(PREFIX_6699);

    // 55AA broadcasts are CRC32-checked, so they take no key; 6699 broadcasts are GCM.
    const { frames } = decodeFrames(message, is6699 ? { key: UDP_KEY } : {});
    const frame = frames[0];
    if (!frame) return null;

    const json = parseJson(decryptBroadcastPayload(frame.payload, is6699));
    if (!json) return null;

    const deviceId = typeof json.gwId === "string" ? json.gwId : null;
    const ip = typeof json.ip === "string" ? json.ip : null;
    if (!deviceId || !ip) return null;

    return {
        deviceId,
        ip,
        version: isTuyaProtocolVersion(json.version) ? json.version : null,
        productKey: typeof json.productKey === "string" ? json.productKey : null,
        active: json.active !== 0,
        discoveredAt: new Date(),
    };
}

function decryptBroadcastPayload(payload: Buffer, is6699: boolean): Buffer {
    if (is6699) return payload; // the frame layer already decrypted it
    if (payload.length === 0 || payload.length % 16 !== 0) return payload; // port 6666 sends clear text
    try {
        return aesEcbDecrypt(UDP_KEY, payload);
    } catch {
        return payload;
    }
}

function parseJson(payload: Buffer): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(payload.toString("utf8"));
        return typeof parsed === "object" && parsed !== null
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}
