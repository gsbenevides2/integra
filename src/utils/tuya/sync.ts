import { addTracerEvent, serializeError } from "core/instrumentation";
import { listEnabledDevices, markDeviceSeen } from "utils/tuya/devices";
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
    const lamps = await listEnabledDevices();
    let changed = 0;
    let offline = 0;

    for (const lamp of lamps) {
        try {
            const state = await readStateSafe(lamp);
            if (!state.online) offline++;
            if (await saveStateIfChanged(lamp.id, state)) changed++;
        } catch (error) {
            await addTracerEvent({
                traceId,
                eventName: "Tuya lamp reconcile failed",
                eventType: "ERROR",
                eventData: { lampId: lamp.id, name: lamp.name, error: serializeError(error) },
            });
        }
    }

    await addTracerEvent({
        traceId,
        eventName: "Tuya reconcile finished",
        eventType: "INFO",
        eventData: { lamps: lamps.length, offline, changed },
    });
}
