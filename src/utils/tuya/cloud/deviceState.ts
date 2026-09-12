import type { TuyaCommand, TuyaStatusEntry } from "utils/tuya/cloud/client";
import {
    MAX_SWITCH_CHANNELS,
    type DeviceState,
    type WorkMode,
    OFFLINE_STATE,
    WORK_MODES,
    percentToRaw,
} from "utils/tuya/capabilities";
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "utils/tuya/color";

/**
 * The cloud speaks data point *codes* while the LAN protocol speaks numeric indices, and it
 * carries colour as a JSON object instead of a packed hex string. Newer firmware exposes the
 * `_v2` variants with wider ranges, so the codes a device actually reports decide which
 * pair is used.
 */
interface CloudCodes {
    power: string;
    brightness: string | null;
    colorTemp: string | null;
    color: string | null;
    workMode: string | null;
    brightnessMax: number;
    colorTempMax: number;
    colorMax: number;
}

const BRIGHTNESS_MIN_V2 = 10;
const BRIGHTNESS_MIN_V1 = 25;

export function detectCloudCodes(status: TuyaStatusEntry[]): CloudCodes {
    const codes = new Set(status.map((entry) => entry.code));
    const isV2 = codes.has("bright_value_v2") || codes.has("colour_data_v2");

    return {
        power: "switch_led",
        brightness: pick(codes, isV2 ? ["bright_value_v2", "bright_value"] : ["bright_value"]),
        colorTemp: pick(codes, isV2 ? ["temp_value_v2", "temp_value"] : ["temp_value"]),
        color: pick(codes, isV2 ? ["colour_data_v2", "colour_data"] : ["colour_data"]),
        workMode: codes.has("work_mode") ? "work_mode" : null,
        brightnessMax: isV2 ? 1000 : 255,
        colorTempMax: isV2 ? 1000 : 255,
        colorMax: isV2 ? 1000 : 255,
    };
}

function pick(codes: Set<string>, candidates: string[]): string | null {
    return candidates.find((code) => codes.has(code)) ?? null;
}

function toPercent(value: number, min: number, max: number): number | null {
    if (max === min) return null;
    return Math.round(Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)));
}

interface CloudHsv {
    h: number;
    s: number;
    v: number;
}

function parseCloudColor(raw: unknown, max: number): string | null {
    const parsed = typeof raw === "string" ? safeJson(raw) : raw;
    if (!parsed || typeof parsed !== "object") return null;

    const { h, s, v } = parsed as Partial<CloudHsv>;
    if (typeof h !== "number" || typeof s !== "number" || typeof v !== "number") return null;

    return rgbToHex(...hsvToRgb({ h, s: s / max, v: v / max }));
}

function safeJson(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function cloudStatusToDeviceState(status: TuyaStatusEntry[], online: boolean): DeviceState {
    if (!online || status.length === 0) return OFFLINE_STATE;

    const codes = detectCloudCodes(status);
    const byCode = new Map(status.map((entry) => [entry.code, entry.value]));

    const brightness = codes.brightness ? byCode.get(codes.brightness) : undefined;
    const colorTemp = codes.colorTemp ? byCode.get(codes.colorTemp) : undefined;
    const workMode = codes.workMode ? byCode.get(codes.workMode) : undefined;

    const brightnessMin = codes.brightnessMax === 1000 ? BRIGHTNESS_MIN_V2 : BRIGHTNESS_MIN_V1;

    return {
        online: true,
        channels: null,
        power:
            typeof byCode.get(codes.power) === "boolean"
                ? (byCode.get(codes.power) as boolean)
                : null,
        brightness:
            typeof brightness === "number"
                ? toPercent(brightness, brightnessMin, codes.brightnessMax)
                : null,
        colorTemp:
            typeof colorTemp === "number" ? toPercent(colorTemp, 0, codes.colorTempMax) : null,
        colorHex: codes.color ? parseCloudColor(byCode.get(codes.color), codes.colorMax) : null,
        workMode: WORK_MODES.includes(workMode as WorkMode) ? (workMode as WorkMode) : null,
    };
}

export interface CloudDeviceCommand {
    power?: boolean;
    brightness?: number;
    colorTemp?: number;
    colorHex?: string;
    workMode?: WorkMode;
}

/** Translates a normalised command into the codes this particular device advertises. */
export function deviceCommandToCloudCommands(
    command: CloudDeviceCommand,
    status: TuyaStatusEntry[],
): TuyaCommand[] {
    const codes = detectCloudCodes(status);
    const commands: TuyaCommand[] = [];

    if (command.power !== undefined) commands.push({ code: codes.power, value: command.power });

    if (command.brightness !== undefined && codes.brightness) {
        const min = codes.brightnessMax === 1000 ? BRIGHTNESS_MIN_V2 : BRIGHTNESS_MIN_V1;
        commands.push({
            code: codes.brightness,
            value: percentToRaw(command.brightness, min, codes.brightnessMax),
        });
    }

    if (command.colorTemp !== undefined && codes.colorTemp) {
        commands.push({
            code: codes.colorTemp,
            value: percentToRaw(command.colorTemp, 0, codes.colorTempMax),
        });
        if (codes.workMode && command.workMode === undefined) {
            commands.push({ code: codes.workMode, value: "white" });
        }
    }

    if (command.colorHex !== undefined && codes.color) {
        const rgb = hexToRgb(command.colorHex);
        if (!rgb) throw new Error(`Invalid colour "${command.colorHex}", expected #rrggbb`);
        const hsv = rgbToHsv(...rgb);
        commands.push({
            code: codes.color,
            value: {
                h: Math.round(hsv.h),
                s: Math.round(hsv.s * codes.colorMax),
                v: Math.round(hsv.v * codes.colorMax),
            },
        });
        if (codes.workMode && command.workMode === undefined) {
            commands.push({ code: codes.workMode, value: "colour" });
        }
    }

    if (command.workMode !== undefined && codes.workMode) {
        commands.push({ code: codes.workMode, value: command.workMode });
    }

    return commands;
}

/** Relay modules expose one boolean per channel, as `switch_1` through `switch_6`. */
export function cloudStatusToSwitchState(status: TuyaStatusEntry[], online: boolean): DeviceState {
    if (status.length === 0) return OFFLINE_STATE;

    const channels: Record<string, boolean> = {};
    for (const entry of status) {
        const match = /^switch_(\d+)$/.exec(entry.code);
        if (!match) continue;
        const channel = Number(match[1]);
        if (channel < 1 || channel > MAX_SWITCH_CHANNELS) continue;
        if (typeof entry.value === "boolean") channels[String(channel)] = entry.value;
    }

    if (Object.keys(channels).length === 0) return OFFLINE_STATE;
    // The status shadow keeps its last known values while a device is unplugged, so the
    // reachability flag has to come from the device record rather than from the payload.
    return { ...OFFLINE_STATE, online, channels };
}

export function switchChannelsToCloudCommands(channels: Record<string, boolean>): TuyaCommand[] {
    return Object.entries(channels).map(([channel, value]) => ({
        code: `switch_${channel}`,
        value,
    }));
}
