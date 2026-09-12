/**
 * The surface scripts are meant to use. Everything here resolves devices and sensors by
 * their friendly name — the same name shown in the Smart Life app and in the dashboard — so
 * an automation reads like a sentence instead of a list of opaque ids.
 *
 * Control goes over the LAN when the device is reachable and falls back to the Tuya cloud
 * otherwise; callers do not choose, but the result says which path answered.
 */
import { DONT_TRACE_ID } from "core/instrumentation";
import type { DeviceState, WorkMode } from "utils/tuya/capabilities";
import type { DeviceCommand } from "utils/tuya/commands";
import { type DeviceAccessResult, commandDevice, readDeviceState } from "utils/tuya/deviceAccess";
import { type Device, type PublicDevice, listDevices } from "utils/tuya/devices";
import { db } from "core/db";
import { tuyaDevices } from "core/db/schema";
import { type Sensor, getLatestReadings, getReadingHistory, listSensors } from "utils/tuya/sensors";
import { getStateHistory } from "utils/tuya/state";

export type { DeviceState, DeviceCommand, DeviceAccessResult, Device, Sensor, PublicDevice };

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

/** Resolves by internal id, Tuya device id, or friendly name (case-insensitive). */
async function resolveDevice(nameOrId: string): Promise<Device> {
    const wanted = normalize(nameOrId);
    const all = await db.select().from(tuyaDevices);

    const found =
        all.find((device) => device.id === nameOrId) ??
        all.find((device) => device.tuyaDeviceId === nameOrId) ??
        all.find((device) => normalize(device.name) === wanted);

    if (!found) {
        throw new Error(
            `No Tuya device called "${nameOrId}". Known devices: ${all.map((d) => d.name).join(", ") || "none"}`,
        );
    }
    return found;
}

async function resolveSensor(nameOrId: string): Promise<Sensor> {
    const wanted = normalize(nameOrId);
    const all = await listSensors();

    const found =
        all.find((sensor) => sensor.id === nameOrId) ??
        all.find((sensor) => sensor.tuyaDeviceId === nameOrId) ??
        all.find((sensor) => normalize(sensor.name) === wanted);

    if (!found) {
        throw new Error(
            `No Tuya sensor called "${nameOrId}". Known sensors: ${all.map((s) => s.name).join(", ") || "none"}`,
        );
    }
    return found;
}

// ---------------------------------------------------------------- devices: reading

export async function getDevices(): Promise<PublicDevice[]> {
    return listDevices();
}

export async function getDeviceState(
    nameOrId: string,
    traceId: string = DONT_TRACE_ID,
): Promise<DeviceState> {
    const device = await resolveDevice(nameOrId);
    return (await readDeviceState(device, traceId)).state;
}

export async function isOn(nameOrId: string, traceId: string = DONT_TRACE_ID): Promise<boolean> {
    const state = await getDeviceState(nameOrId, traceId);
    if (state.channels) return Object.values(state.channels).some(Boolean);
    return state.power === true;
}

export async function getDeviceHistory(nameOrId: string, before?: Date) {
    const device = await resolveDevice(nameOrId);
    return getStateHistory(device.id, before);
}

// ---------------------------------------------------------------- devices: control

async function command(
    nameOrId: string,
    payload: DeviceCommand,
    traceId: string,
): Promise<DeviceAccessResult> {
    const device = await resolveDevice(nameOrId);
    return commandDevice(device, payload, traceId);
}

export async function turnOn(nameOrId: string, traceId: string = DONT_TRACE_ID) {
    return command(nameOrId, { power: true }, traceId);
}

export async function turnOff(nameOrId: string, traceId: string = DONT_TRACE_ID) {
    return command(nameOrId, { power: false }, traceId);
}

export async function toggle(nameOrId: string, traceId: string = DONT_TRACE_ID) {
    return command(nameOrId, { power: !(await isOn(nameOrId, traceId)) }, traceId);
}

/** Brightness as a percentage from 0 to 100, whatever raw range the bulb uses. */
export async function setBrightness(
    nameOrId: string,
    percent: number,
    traceId: string = DONT_TRACE_ID,
) {
    return command(nameOrId, { brightness: percent }, traceId);
}

/** Colour temperature as a percentage from 0 (warmest) to 100 (coolest). */
export async function setColorTemp(
    nameOrId: string,
    percent: number,
    traceId: string = DONT_TRACE_ID,
) {
    return command(nameOrId, { colorTemp: percent }, traceId);
}

/** Colour as `#rrggbb`; the bulb is switched into colour mode automatically. */
export async function setColor(nameOrId: string, hex: string, traceId: string = DONT_TRACE_ID) {
    return command(nameOrId, { colorHex: hex }, traceId);
}

export async function setWorkMode(
    nameOrId: string,
    mode: WorkMode,
    traceId: string = DONT_TRACE_ID,
) {
    return command(nameOrId, { workMode: mode }, traceId);
}

/** Drives one relay channel of a multi-gang switch; channels are numbered from 1. */
export async function setChannel(
    nameOrId: string,
    channel: number | string,
    on: boolean,
    traceId: string = DONT_TRACE_ID,
) {
    return command(nameOrId, { channels: { [String(channel)]: on } }, traceId);
}

export async function setChannels(
    nameOrId: string,
    channels: Record<string, boolean>,
    traceId: string = DONT_TRACE_ID,
) {
    return command(nameOrId, { channels }, traceId);
}

// ---------------------------------------------------------------- sensors

export async function getSensors(): Promise<Sensor[]> {
    return listSensors();
}

/** Every current data point of a sensor, keyed by code, as raw strings. */
export async function getSensorReadings(nameOrId: string): Promise<Record<string, string>> {
    const sensor = await resolveSensor(nameOrId);
    return getLatestReadings(sensor.id);
}

export async function getSensorValue(nameOrId: string, code: string): Promise<string | null> {
    return (await getSensorReadings(nameOrId))[code] ?? null;
}

/** Tuya reports temperature in tenths of a degree; this returns real degrees Celsius. */
export async function getTemperature(nameOrId: string): Promise<number | null> {
    const raw = await getSensorValue(nameOrId, "va_temperature");
    return raw === null ? null : Number(raw) / 10;
}

export async function getHumidity(nameOrId: string): Promise<number | null> {
    const raw = await getSensorValue(nameOrId, "va_humidity");
    return raw === null ? null : Number(raw);
}

export async function isDoorOpen(nameOrId: string): Promise<boolean | null> {
    const raw = await getSensorValue(nameOrId, "doorcontact_state");
    return raw === null ? null : raw === "true";
}

export async function isMotionDetected(nameOrId: string): Promise<boolean | null> {
    const raw =
        (await getSensorValue(nameOrId, "pir_state")) ?? (await getSensorValue(nameOrId, "pir"));
    return raw === null ? null : raw === "pir" || raw === "true";
}

export async function getSensorHistory(
    nameOrId: string,
    options: { code?: string; before?: Date } = {},
) {
    const sensor = await resolveSensor(nameOrId);
    return getReadingHistory(sensor.id, options);
}
