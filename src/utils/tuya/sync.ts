import { addTracerEvent, serializeError } from "core/instrumentation";
import { type DeviceState, OFFLINE_STATE } from "utils/tuya/capabilities";
import { readStatesFromCloud } from "utils/tuya/deviceAccess";
import { type Device, listEnabledDevices, markDeviceSeen } from "utils/tuya/devices";
import { refreshDiscovery } from "utils/tuya/discoveryCache";
import { readStateSafe } from "utils/tuya/registry";
import { pruneStateHistory, saveStateIfChanged } from "utils/tuya/state";

const DISCOVERY_WINDOW_MS = 6_000;
const HISTORY_RETENTION_DAYS = 30;

/** Listens for a short window and updates the IP of every lamp that announced itself. */
export async function runDiscovery(traceId: string): Promise<void> {
    const devices = await refreshDiscovery(DISCOVERY_WINDOW_MS);

    await addTracerEvent({
        traceId,
        eventName: "Tuya discovery finished",
        eventType: "INFO",
        eventData: {
            found: devices.length,
            devices: devices.map(({ deviceId, ip, version }) => ({ deviceId, ip, version })),
        },
    });

    const lamps = await listEnabledDevices();
    const byDeviceId = new Map(devices.map((device) => [device.deviceId, device]));

    for (const lamp of lamps) {
        const discovered = byDeviceId.get(lamp.tuyaDeviceId);
        if (!discovered || discovered.ip === lamp.ip) continue;
        await markDeviceSeen(lamp.id, discovered.ip);
    }

    const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await pruneStateHistory(cutoff);
}

/**
 * Reconnects dropped sockets and reconciles the recorded state with reality. Pushed STATUS
 * frames already cover changes while a socket is up, so this mostly matters after a restart
 * or a dropped connection.
 */
export async function reconcileDevices(traceId: string): Promise<void> {
    const devices = await listEnabledDevices();

    const states = new Map<string, DeviceState>();
    const unreachable: Device[] = [];

    for (const device of devices) {
        const state = await readStateSafe(device);
        // A local read that succeeded is by definition online; anything else is a device
        // the LAN could not reach, which says nothing about whether it is actually down.
        if (state.online) states.set(device.id, state);
        else unreachable.push(device);
    }

    const viaCloud = await fillFromCloud(states, unreachable, traceId);

    let changed = 0;
    let offline = 0;

    for (const device of devices) {
        const state = states.get(device.id) ?? OFFLINE_STATE;
        if (!state.online) offline++;
        try {
            if (await saveStateIfChanged(device.id, state)) changed++;
        } catch (error) {
            await addTracerEvent({
                traceId,
                eventName: "Tuya lamp reconcile failed",
                eventType: "ERROR",
                eventData: { lampId: device.id, name: device.name, error: serializeError(error) },
            });
        }
    }

    await addTracerEvent({
        traceId,
        eventName: "Tuya reconcile finished",
        eventType: "INFO",
        eventData: { lamps: devices.length, offline, viaCloud, changed },
    });
}

/**
 * Asks the cloud about whatever the LAN could not answer for, so the dashboard stops
 * reporting a device as offline while the Smart Life app controls it happily — which is
 * exactly what a device on another network, or one this host cannot discover, looks like.
 * A cloud outage is not worth failing the sweep over: those devices simply stay unknown.
 */
async function fillFromCloud(
    states: Map<string, DeviceState>,
    unreachable: Device[],
    traceId: string,
): Promise<number> {
    if (unreachable.length === 0) return 0;

    try {
        let online = 0;
        for (const [deviceId, state] of await readStatesFromCloud(unreachable, traceId)) {
            states.set(deviceId, state);
            if (state.online) online++;
        }
        return online;
    } catch (error) {
        await addTracerEvent({
            traceId,
            eventName: "Tuya cloud fallback failed",
            eventType: "ERROR",
            eventData: {
                devices: unreachable.map((device) => device.name),
                error: serializeError(error),
            },
        });
        return 0;
    }
}
