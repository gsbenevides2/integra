import { addTracerEvent } from "core/instrumentation";
import { onTuyaDeviceChange, onTuyaSensorChange } from "core/triggers/tuya";
import { getTemperature, setColor, turnOff, turnOn } from "utils/tuya";

/**
 * Turns the bedroom lamp on when the motion sensor trips. Filtering on `value` means the
 * script only runs on the rising edge, never when the sensor clears.
 */
export const motionLightsUp = onTuyaSensorChange(
    {
        id: "tuya-motion-lights-up",
        kind: "motion",
        code: "pir_state",
        value: "pir",
    },
    async (event, traceId) => {
        await addTracerEvent({
            traceId,
            eventName: "Motion detected",
            eventType: "INFO",
            eventData: { sensor: event.sensor.name, at: event.at.toISOString() },
        });
        await turnOn("Quarto do Gui", traceId);
    },
);

/** Paints the lamp red while a door is open, and turns it off once every door is closed. */
export const doorOpenAlert = onTuyaSensorChange(
    {
        id: "tuya-door-alert",
        kind: "door",
        code: "doorcontact_state",
    },
    async (event, traceId) => {
        const opened = event.value === "true";
        await addTracerEvent({
            traceId,
            eventName: opened ? "Door opened" : "Door closed",
            eventType: "INFO",
            eventData: { sensor: event.sensor.name, previous: event.previousValue },
        });

        if (opened) await setColor("Quarto do Gui", "#ff0000", traceId);
        else await turnOff("Quarto do Gui", traceId);
    },
);

/** Logs every lamp and switch transition, with the reading that prompted it. */
export const deviceStateLog = onTuyaDeviceChange(
    {
        id: "tuya-device-log",
        field: ["power", "channels", "online"],
    },
    async (event, traceId) => {
        await addTracerEvent({
            traceId,
            eventName: "Tuya device changed",
            eventType: "INFO",
            eventData: {
                device: event.device.name,
                kind: event.device.kind,
                changed: event.changed,
                power: event.current.power,
                channels: event.current.channels,
                temperature: await getTemperature("Humidade E Temperatura"),
            },
        });
    },
);
