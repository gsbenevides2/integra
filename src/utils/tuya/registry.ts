import { createTracerIfNotExtistsAndAppendEvent, serializeError } from "core/instrumentation";
import {
    type BulbType,
    type DeviceState,
    OFFLINE_STATE,
    normalizeState,
    normalizeSwitchState,
} from "utils/tuya/capabilities";
import { type Device, clearDeviceIp, markDeviceSeen, revealLocalKey } from "utils/tuya/devices";
import { getDiscovered, listDiscovered } from "utils/tuya/discoveryCache";
import { type DeviceProfile, probeDevice, resolveIp } from "utils/tuya/probe";
import { saveStateIfChanged } from "utils/tuya/state";
import { TuyaLocalDevice } from "utils/tuya/protocol/device";
import { TuyaLocalKeyError } from "utils/tuya/protocol/session";
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

/**
 * A probe walks every candidate address and protocol version with a five-second timeout
 * each, so a device that is simply unplugged must not be re-probed on every sweep.
 */
const REPROBE_COOLDOWN_MS = 5 * 60 * 1000;

/** How many local failures in a row condemn a stored address as a dead lease. */
const STALE_IP_FAILURES = 3;

const localFailures = new Map<string, number>();
const lastProbeAt = new Map<string, number>();

/** The stored profile, when it is complete enough to open a socket without probing first. */
function storedProfile(record: Device): DeviceProfile | null {
    const ip = resolveIp(record);
    // A relay module has no bulb layout to discover, so it only needs an address and a
    // protocol version before it can be talked to.
    const needsBulbType = record.kind === "lamp" && !record.bulbType;
    if (!ip || !record.protocolVersion || needsBulbType) return null;
    return { ip, protocolVersion: record.protocolVersion, bulbType: record.bulbType };
}

async function openConnection(record: Device): Promise<Connection> {
    try {
        const connection = await connectWithHealing(record);
        localFailures.delete(record.id);
        return connection;
    } catch (error) {
        await noteLocalFailure(record);
        throw error;
    }
}

async function connectWithHealing(record: Device): Promise<Connection> {
    const stored = storedProfile(record);

    if (stored) {
        try {
            return await connectProfile(record, stored);
        } catch (error) {
            // A stored address ages badly: a DHCP lease moves and every read after it goes
            // to whatever answers at the old one. Re-probing walks the addresses the device
            // is announcing now, so a device that only moved finds its way back instead of
            // reading as offline until somebody edits the record by hand.
            if (error instanceof TuyaLocalKeyError) throw error;
            if (!mayProbe(record.id)) throw error;
        }
    }

    return connectProbed(record);
}

/** Rebuilds the stored profile from what the device answers to, then connects on it. */
async function connectProbed(record: Device): Promise<Connection> {
    lastProbeAt.set(record.id, Date.now());
    return connectProfile(record, await probeDevice(record));
}

function mayProbe(deviceId: string): boolean {
    return Date.now() - (lastProbeAt.get(deviceId) ?? 0) >= REPROBE_COOLDOWN_MS;
}

async function connectProfile(record: Device, profile: DeviceProfile): Promise<Connection> {
    const device = new TuyaLocalDevice({
        id: record.tuyaDeviceId,
        key: await revealLocalKey(record),
        ip: profile.ip,
        version: profile.protocolVersion,
    });

    const deviceId = record.id;
    const layout = profile.bulbType;
    const kind = record.kind;
    const connection: Connection = {
        device,
        kind,
        bulbType: layout,
        protocolVersion: profile.protocolVersion,
        ip: profile.ip,
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

    try {
        await device.connect();
    } catch (error) {
        // Nothing has been registered yet, so a failed attempt would otherwise leave its
        // half-open socket and listeners behind on every retry.
        device.removeAllListeners();
        device.disconnect();
        throw error;
    }

    connections.set(deviceId, connection);
    return connection;
}

/**
 * Counts a failed local connection and, once a stored address has failed repeatedly, forgets
 * it so discovery can supply a fresh one. Only done while discovery is demonstrably working
 * on this host: when nothing at all is broadcasting — a container on a bridge network, say —
 * the stored address is the only lead there is, and dropping it would strand the device.
 */
async function noteLocalFailure(record: Device): Promise<void> {
    const failures = (localFailures.get(record.id) ?? 0) + 1;
    localFailures.set(record.id, failures);

    if (!record.ip || failures < STALE_IP_FAILURES) return;
    // Still announcing itself? Then its address is not what is wrong.
    if (listDiscovered().length === 0 || getDiscovered(record.tuyaDeviceId)) return;

    try {
        await clearDeviceIp(record.id);
        localFailures.delete(record.id);
    } catch {
        // Bookkeeping must never replace the connection error the caller is about to throw.
    }
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
    try {
        return await readFrom(record, await getConnection(record));
    } catch (error) {
        // A stored profile can be wrong rather than merely unreachable: a firmware upgrade
        // moves a device onto another protocol version, and a socket that opens but never
        // answers looks exactly like that. Probing rewrites the profile and tries once more.
        if (error instanceof TuyaLocalKeyError || !mayProbe(record.id)) throw error;
        dropConnection(record.id);
        return readFrom(record, await connectProbed(record));
    }
}

async function readFrom(record: Device, connection: Connection): Promise<DeviceState> {
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
