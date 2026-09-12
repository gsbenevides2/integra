import { EventEmitter } from "node:events";
import type { DeviceState } from "utils/tuya/capabilities";
import type { Device } from "utils/tuya/devices";
import type { Sensor } from "utils/tuya/sensors";

/** Fields of a device state that a script can watch for changes. */
export const DEVICE_FIELDS = [
    "online",
    "power",
    "brightness",
    "colorTemp",
    "colorHex",
    "workMode",
    "channels",
] as const;

export type DeviceField = (typeof DEVICE_FIELDS)[number];

export interface DeviceChangeEvent {
    device: Device;
    previous: DeviceState | null;
    current: DeviceState;
    /** Which fields actually differ; empty on the very first reading. */
    changed: DeviceField[];
    at: Date;
}

export interface SensorChangeEvent {
    sensor: Sensor;
    /** The Tuya data point code, such as `pir_state` or `doorcontact_state`. */
    code: string;
    value: string;
    previousValue: string | null;
    /** The device's own timestamp for the change, not the moment it was collected. */
    at: Date;
}

/**
 * In-process bus between the Tuya collectors and any script watching them. It carries what
 * changed and what it changed from, because "the door is open" and "the door just opened"
 * are different questions and automations almost always mean the second.
 */
class TuyaEventBus extends EventEmitter {
    emitDeviceChange(event: DeviceChangeEvent): void {
        this.emit("device", event);
    }

    emitSensorChange(event: SensorChangeEvent): void {
        this.emit("sensor", event);
    }

    onDeviceChange(listener: (event: DeviceChangeEvent) => void): () => void {
        this.on("device", listener);
        return () => this.off("device", listener);
    }

    onSensorChange(listener: (event: SensorChangeEvent) => void): () => void {
        this.on("sensor", listener);
        return () => this.off("sensor", listener);
    }
}

export const tuyaEvents = new TuyaEventBus();

// Many scripts may watch the same lamp; the default cap of 10 is for leak detection, not
// for a deliberate fan-out like this one.
tuyaEvents.setMaxListeners(100);

export function diffDeviceState(previous: DeviceState | null, current: DeviceState): DeviceField[] {
    if (!previous) return [];
    return DEVICE_FIELDS.filter((field) => {
        if (field === "channels") {
            return JSON.stringify(previous.channels) !== JSON.stringify(current.channels);
        }
        return previous[field] !== current[field];
    });
}
