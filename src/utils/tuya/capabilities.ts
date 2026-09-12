import { encodingForBulbType, tuyaColorToHex, type ColorEncoding } from "utils/tuya/color";
import type { TuyaDps } from "utils/tuya/protocol/types";

export const BULB_TYPES = ["A", "B", "C"] as const;
export type BulbType = (typeof BULB_TYPES)[number];

export const WORK_MODES = ["white", "colour", "scene", "music"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

interface BulbProfile {
    switch: string;
    mode: string | null;
    brightness: string | null;
    colorTemp: string | null;
    color: string | null;
    brightnessMin: number;
    brightnessMax: number;
    colorTempMin: number;
    colorTempMax: number;
    colorEncoding: ColorEncoding;
}

/**
 * Tuya bulbs report data points by numeric index, and the index layout depends on the
 * bulb generation rather than on anything the device advertises. These are the three
 * layouts in the wild.
 */
const PROFILES: Record<BulbType, BulbProfile> = {
    A: {
        switch: "1",
        mode: "2",
        brightness: "3",
        colorTemp: "4",
        color: "5",
        brightnessMin: 25,
        brightnessMax: 255,
        colorTempMin: 0,
        colorTempMax: 255,
        colorEncoding: encodingForBulbType("A"),
    },
    B: {
        switch: "20",
        mode: "21",
        brightness: "22",
        colorTemp: "23",
        color: "24",
        brightnessMin: 10,
        brightnessMax: 1000,
        colorTempMin: 0,
        colorTempMax: 1000,
        colorEncoding: encodingForBulbType("B"),
    },
    C: {
        switch: "1",
        mode: null,
        brightness: "2",
        colorTemp: "3",
        color: null,
        brightnessMin: 25,
        brightnessMax: 255,
        colorTempMin: 0,
        colorTempMax: 255,
        colorEncoding: encodingForBulbType("C"),
    },
};

export function profileFor(bulbType: BulbType): BulbProfile {
    return PROFILES[bulbType];
}

export function isBulbType(value: unknown): value is BulbType {
    return BULB_TYPES.includes(value as BulbType);
}

/**
 * Infers the bulb layout from the data points a device actually reports. Type B is
 * unmistakable (its indices start at 20), and among the low-index layouts the presence of
 * a colour data point is what separates A from C.
 */
export function detectBulbType(dps: TuyaDps): BulbType | null {
    if ("20" in dps) return "B";
    if ("5" in dps || "2" in dps) return "A";
    if ("1" in dps) return "C";
    return null;
}

export interface LampCapabilities {
    brightness: boolean;
    colorTemp: boolean;
    color: boolean;
    workMode: boolean;
}

export function capabilitiesFor(bulbType: BulbType, dps: TuyaDps): LampCapabilities {
    const profile = PROFILES[bulbType];
    const has = (dp: string | null) => dp !== null && dp in dps;
    return {
        brightness: has(profile.brightness),
        colorTemp: has(profile.colorTemp),
        color: has(profile.color),
        workMode: has(profile.mode),
    };
}

/** The highest relay channel any supported switch exposes. */
export const MAX_SWITCH_CHANNELS = 6;

export interface DeviceState {
    online: boolean;
    power: boolean | null;
    /** 0-100, normalised so the UI never sees the per-type raw ranges. */
    brightness: number | null;
    /** 0-100, normalised. */
    colorTemp: number | null;
    colorHex: string | null;
    workMode: WorkMode | null;
    /** Switches only: relay state keyed by channel number. */
    channels: Record<string, boolean> | null;
}

export const OFFLINE_STATE: DeviceState = {
    online: false,
    power: null,
    brightness: null,
    colorTemp: null,
    colorHex: null,
    workMode: null,
    channels: null,
};

/**
 * Relay modules report each channel as a plain boolean under its channel number, alongside
 * unrelated data points such as countdown timers — so only the booleans in range count.
 */
export function normalizeSwitchState(dps: TuyaDps): DeviceState {
    const channels: Record<string, boolean> = {};
    for (let channel = 1; channel <= MAX_SWITCH_CHANNELS; channel++) {
        const value = dps[String(channel)];
        if (typeof value === "boolean") channels[String(channel)] = value;
    }

    return { ...OFFLINE_STATE, online: true, channels };
}

export function switchChannelsToDps(channels: Record<string, boolean>): TuyaDps {
    const dps: TuyaDps = {};
    for (const [channel, value] of Object.entries(channels)) dps[channel] = value;
    return dps;
}

export function normalizeState(bulbType: BulbType, dps: TuyaDps): DeviceState {
    const profile = PROFILES[bulbType];

    return {
        online: true,
        channels: null,
        power: readBoolean(dps, profile.switch),
        brightness: scaleToPercent(
            readNumber(dps, profile.brightness),
            profile.brightnessMin,
            profile.brightnessMax,
        ),
        colorTemp: scaleToPercent(
            readNumber(dps, profile.colorTemp),
            profile.colorTempMin,
            profile.colorTempMax,
        ),
        colorHex: readColor(dps, profile),
        workMode: readWorkMode(dps, profile.mode),
    };
}

export function statesEqual(a: DeviceState, b: DeviceState): boolean {
    return (
        a.online === b.online &&
        a.power === b.power &&
        a.brightness === b.brightness &&
        a.colorTemp === b.colorTemp &&
        a.colorHex === b.colorHex &&
        a.workMode === b.workMode &&
        JSON.stringify(a.channels) === JSON.stringify(b.channels)
    );
}

export function percentToRaw(percent: number, min: number, max: number): number {
    const bounded = Math.min(100, Math.max(0, percent));
    return Math.round(min + (bounded / 100) * (max - min));
}

export function brightnessToRaw(bulbType: BulbType, percent: number): number {
    const profile = PROFILES[bulbType];
    return percentToRaw(percent, profile.brightnessMin, profile.brightnessMax);
}

export function colorTempToRaw(bulbType: BulbType, percent: number): number {
    const profile = PROFILES[bulbType];
    return percentToRaw(percent, profile.colorTempMin, profile.colorTempMax);
}

function scaleToPercent(value: number | null, min: number, max: number): number | null {
    if (value === null || max === min) return null;
    const percent = ((value - min) / (max - min)) * 100;
    return Math.round(Math.min(100, Math.max(0, percent)));
}

function readBoolean(dps: TuyaDps, dp: string): boolean | null {
    const value = dps[dp];
    return typeof value === "boolean" ? value : null;
}

function readNumber(dps: TuyaDps, dp: string | null): number | null {
    if (dp === null) return null;
    const value = dps[dp];
    return typeof value === "number" ? value : null;
}

function readColor(dps: TuyaDps, profile: BulbProfile): string | null {
    if (profile.color === null) return null;
    const value = dps[profile.color];
    return typeof value === "string" ? tuyaColorToHex(value) : null;
}

function readWorkMode(dps: TuyaDps, dp: string | null): WorkMode | null {
    if (dp === null) return null;
    const value = dps[dp];
    return WORK_MODES.includes(value as WorkMode) ? (value as WorkMode) : null;
}
