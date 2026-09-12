import { createTracerIfNotExtistsAndAppendEvent, serializeError } from "core/instrumentation";
import {
    type BulbType,
    type DeviceState,
    OFFLINE_STATE,
    normalizeState,
    normalizeSwitchState,
} from "utils/tuya/capabilities";
import { type Device, markDeviceSeen, revealLocalKey } from "utils/tuya/devices";
import { probeDevice, resolveIp } from "utils/tuya/probe";
import { saveStateIfChanged } from "utils/tuya/state";
import { TuyaLocalDevice } from "utils/tuya/protocol/device";
import type { TuyaDps, TuyaProtocolVersion } from "utils/tuya/protocol/types";

type DeviceKind = Device["kind"];

interface Connection {
    device: TuyaLocalDevice;
    kind: DeviceKind;
    /** Lamps only; a relay module has no bulb layout. */
    bulbType: BulbType | null;
    protocolVersion: TuyaProtocolVersion;
    ip: string;
    /**
     * The last full picture of the device's data points. Pushed STATUS frames only carry
     * the data points that changed, so they are merged onto this rather than read alone.
     */
    dps: TuyaDps;
    /** False until a full read has happened, so a partial push is never recorded on its own. */
    primed: boolean;
    flushTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * A record running a colour scene pushes a new state several times a second. Recording each
 * one would bury the real events — a light turned on, dimmed, or lost — under thousands of
 * animation frames, so a burst is collapsed into the state it settles on.
 */
const PUSH_FLUSH_MS = 10_000;

/** Turns raw data points into the shape the rest of the app speaks, per device kind. */
function normalizeFor(kind: DeviceKind, bulbType: BulbType | null, dps: TuyaDps): DeviceState {
    if (kind === "switch") return normalizeSwitchState(dps);
    return bulbType ? normalizeState(bulbType, dps) : OFFLINE_STATE;
}

/**
 * One live socket per record, shared by the UI, the cron and any other caller. Tuya devices
 * accept only a couple of local connections at a time, so opening a socket per command
 * would lock us out of our own lamps.
 */
const connections = new Map<string, Connection>();

export function dropConnection(deviceId: string): void {
    const connection = connections.get(deviceId);
    if (!connection) return;
    if (connection.flushTimer) clearTimeout(connection.flushTimer);
    connection.device.removeAllListeners();
    connection.device.disconnect();
    connections.delete(deviceId);
}

export function dropAllConnections(): void {
    for (const deviceId of [...connections.keys()]) dropConnection(deviceId);
}

async function openConnection(record: Device): Promise<Connection> {
    let protocolVersion = record.protocolVersion;
    let bulbType = record.bulbType;
    let ip = resolveIp(record);

    // A relay module has no bulb layout to discover, so it only needs an address and a
    // protocol version before it can be talked to.
    const needsBulbType = record.kind === "lamp" && !bulbType;
    if (!protocolVersion || !ip || needsBulbType) {
        const probed = await probeDevice(record);
        protocolVersion = probed.protocolVersion;
        bulbType = probed.bulbType;
        ip = probed.ip;
    }

    const device = new TuyaLocalDevice({
        id: record.tuyaDeviceId,
        key: await revealLocalKey(record),
        ip,
        version: protocolVersion,
    });

    const deviceId = record.id;
    const layout = bulbType;
    const kind = record.kind;
    const connection: Connection = {
        device,
        kind,
        bulbType: layout,
        protocolVersion,
        ip,
        dps: {},
        primed: false,
        flushTimer: null,
    };

    device.on("data", (dps: TuyaDps) => {
        Object.assign(connection.dps, dps);
        if (!connection.primed || connection.flushTimer) return;
        connection.flushTimer = setTimeout(() => {
            connection.flushTimer = null;
            void recordPush(deviceId, kind, layout, { ...connection.dps });
        }, PUSH_FLUSH_MS);
    });
    device.on("disconnected", () => connections.delete(deviceId));
    // Without a listener, an emitted "error" would take the whole process down.
    device.on("error", (error: unknown) => {
        void reportDetachedError("Tuya device error", deviceId, error);
    });

    await device.connect();

    connections.set(deviceId, connection);
    return connection;
}

async function getConnection(record: Device): Promise<Connection> {
    const existing = connections.get(record.id);
    if (existing?.device.isConnected()) return existing;

    dropConnection(record.id);
    return openConnection(record);
}

/**
 * Socket callbacks fire outside any trigger's trace, so they open a run of their own
 * instead of vanishing into a console that the dashboard never shows.
 */
async function reportDetachedError(
    eventName: string,
    deviceId: string,
    error: unknown,
): Promise<void> {
    try {
        await createTracerIfNotExtistsAndAppendEvent(
            {
                traceId: crypto.randomUUID(),
                triggerId: "tuya-device",
                workflowType: "device",
                inputData: { deviceId },
            },
            { eventName, eventType: "ERROR", eventData: serializeError(error) },
        );
    } catch {
        // Never let error reporting become the error.
    }
}

/** Persists a state change the device pushed on its own, e.g. from the Smart Life app. */
async function recordPush(
    deviceId: string,
    kind: DeviceKind,
    bulbType: BulbType | null,
    dps: TuyaDps,
): Promise<void> {
    try {
        await saveStateIfChanged(deviceId, normalizeFor(kind, bulbType, dps));
    } catch (error) {
        await reportDetachedError("Tuya push not recorded", deviceId, error);
    }
}

export async function readState(record: Device): Promise<DeviceState> {
    const connection = await getConnection(record);
    const dps = await connection.device.get();
    Object.assign(connection.dps, dps);
    connection.primed = true;
    await markDeviceSeen(record.id, connection.ip);
    return normalizeFor(connection.kind, connection.bulbType, connection.dps);
}

/** Reads state without throwing, so one unreachable device cannot fail a whole sweep. */
export async function readStateSafe(record: Device): Promise<DeviceState> {
    try {
        return await readState(record);
    } catch {
        dropConnection(record.id);
        return OFFLINE_STATE;
    }
}

export async function sendDps(record: Device, dps: TuyaDps): Promise<void> {
    const connection = await getConnection(record);
    await connection.device.set(dps);
}

/** The live state of a connected record, without touching the network. */
export function getCachedState(deviceId: string): DeviceState | null {
    const connection = connections.get(deviceId);
    if (!connection?.primed || !connection.device.isConnected()) return null;
    return normalizeFor(connection.kind, connection.bulbType, connection.dps);
}

export async function getBulbType(record: Device): Promise<BulbType | null> {
    if (record.bulbType) return record.bulbType;
    return (await getConnection(record)).bulbType;
}
