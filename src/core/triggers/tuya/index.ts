import { addTracerEvent, endTracer, serializeError, startTracer } from "core/instrumentation";
import type { TracerStatus } from "core/instrumentation/types";
import type { Trigger, TriggerSettings } from "core/triggers";
import { OFFLINE_STATE } from "utils/tuya/capabilities";
import { listDevices } from "utils/tuya/devices";
import {
    type DeviceChangeEvent,
    type DeviceField,
    type SensorChangeEvent,
    tuyaEvents,
} from "utils/tuya/events";
import { getLatestReadings, listSensors, type SensorKind } from "utils/tuya/sensors";
import { getLatestState } from "utils/tuya/state";

type OneOrMany<T> = T | T[];

function matches<T>(filter: OneOrMany<T> | undefined, value: T): boolean {
    if (filter === undefined) return true;
    return Array.isArray(filter) ? filter.includes(value) : filter === value;
}

/** Device and sensor filters accept either the friendly name or the Tuya device id. */
function matchesIdentity(
    filter: OneOrMany<string> | undefined,
    name: string,
    tuyaDeviceId: string,
    id: string,
): boolean {
    if (filter === undefined) return true;
    const wanted = Array.isArray(filter) ? filter : [filter];
    return wanted.some(
        (entry) =>
            entry === id || entry === tuyaDeviceId || entry.toLowerCase() === name.toLowerCase(),
    );
}

async function runTraced(
    triggerId: string,
    workflowType: string,
    inputData: object,
    body: (traceId: string) => Promise<void>,
): Promise<void> {
    let status: TracerStatus = "SUCCESS";
    const traceId = crypto.randomUUID();
    await startTracer({ inputData, traceId, triggerId, workflowType });
    try {
        await body(traceId);
    } catch (error: unknown) {
        await addTracerEvent({
            traceId,
            eventData: serializeError(error),
            eventName: "Tuya trigger on Error",
            eventType: "ERROR",
        });
        status = "ERROR";
    } finally {
        await endTracer({ outputData: {}, status, traceId });
    }
}

export interface TuyaSensorSettings extends TriggerSettings {
    /** Sensor name, Tuya device id, or internal id. Omit to watch every sensor. */
    sensor?: OneOrMany<string>;
    /** Data point code, such as `pir_state`, `doorcontact_state` or `va_temperature`. */
    code?: OneOrMany<string>;
    kind?: OneOrMany<SensorKind>;
    /** Fire only when the new value is one of these, e.g. `"pir"` or `"true"`. */
    value?: OneOrMany<string>;
}

export type TuyaSensorCall = (event: SensorChangeEvent, traceId: string) => Promise<void>;

/**
 * Runs whenever a sensor data point changes value. The event carries the previous value, so
 * a script can tell "the door is open" from "the door just opened".
 */
export function onTuyaSensorChange(settings: TuyaSensorSettings, func: TuyaSensorCall): Trigger {
    const handles = (event: SensorChangeEvent): boolean =>
        matchesIdentity(
            settings.sensor,
            event.sensor.name,
            event.sensor.tuyaDeviceId,
            event.sensor.id,
        ) &&
        matches(settings.code, event.code) &&
        matches(settings.kind, event.sensor.kind) &&
        matches(settings.value, event.value);

    return {
        id: settings.id,
        type: "tuya-sensor",
        register: async () => {
            tuyaEvents.onSensorChange((event) => {
                if (!handles(event)) return;
                void runTraced(
                    settings.id,
                    "tuya-sensor",
                    {
                        sensor: event.sensor.name,
                        code: event.code,
                        value: event.value,
                        previousValue: event.previousValue,
                        at: event.at.toISOString(),
                    },
                    (traceId) => func(event, traceId),
                );
            });
        },
        // Replays the current value of every matching sensor, so `--test=<id>` exercises the
        // script without waiting for somebody to walk past a motion sensor.
        test: async () => {
            const sensors = await listSensors();
            for (const sensor of sensors) {
                const readings = await getLatestReadings(sensor.id);
                for (const [code, value] of Object.entries(readings)) {
                    const event: SensorChangeEvent = {
                        sensor,
                        code,
                        value,
                        previousValue: null,
                        at: new Date(),
                    };
                    if (!handles(event)) continue;
                    await runTraced(
                        settings.id,
                        "tuya-sensor",
                        { sensor: sensor.name, code, value, replay: true },
                        (traceId) => func(event, traceId),
                    );
                }
            }
        },
    };
}

export interface TuyaDeviceSettings extends TriggerSettings {
    /** Device name, Tuya device id, or internal id. Omit to watch every device. */
    device?: OneOrMany<string>;
    kind?: OneOrMany<"lamp" | "switch">;
    /** Only fire when one of these state fields changed. */
    field?: OneOrMany<DeviceField>;
}

export type TuyaDeviceCall = (event: DeviceChangeEvent, traceId: string) => Promise<void>;

/** Runs whenever a lamp or switch changes state, including changes made outside Integra. */
export function onTuyaDeviceChange(settings: TuyaDeviceSettings, func: TuyaDeviceCall): Trigger {
    const handles = (event: DeviceChangeEvent): boolean => {
        if (
            !matchesIdentity(
                settings.device,
                event.device.name,
                event.device.tuyaDeviceId,
                event.device.id,
            )
        ) {
            return false;
        }
        if (!matches(settings.kind, event.device.kind)) return false;
        if (settings.field === undefined) return true;

        const wanted = Array.isArray(settings.field) ? settings.field : [settings.field];
        return event.changed.some((field) => wanted.includes(field));
    };

    return {
        id: settings.id,
        type: "tuya-device",
        register: async () => {
            tuyaEvents.onDeviceChange((event) => {
                if (!handles(event)) return;
                void runTraced(
                    settings.id,
                    "tuya-device",
                    {
                        device: event.device.name,
                        changed: event.changed,
                        current: event.current,
                        previous: event.previous,
                    },
                    (traceId) => func(event, traceId),
                );
            });
        },
        test: async () => {
            const devices = await listDevices();
            for (const device of devices) {
                const full = { ...device, localKey: "" } as DeviceChangeEvent["device"];
                const event: DeviceChangeEvent = {
                    device: full,
                    previous: null,
                    current: (await getLatestState(device.id)) ?? OFFLINE_STATE,
                    changed: [],
                    at: new Date(),
                };
                if (!handles(event)) continue;
                await runTraced(
                    settings.id,
                    "tuya-device",
                    { device: device.name, replay: true },
                    (traceId) => func(event, traceId),
                );
            }
        },
    };
}
