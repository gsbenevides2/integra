import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv, type Hsv } from "utils/tuya/color";
import type { DeviceCommand, DeviceState } from "./types";

/** 0% is the warmest reading the lamp reports and 100% the coolest. */
export const WHITE_STOPS = ["#ffb46b", "#f6f1ea", "#8ec2ff"];

/** The hue ring, sampled every 30°. */
export const HUE_STOPS = Array.from({ length: 13 }, (_, index) => `hsl(${index * 30} 100% 50%)`);

export const COLOR_PRESETS = [
    "#ff0000",
    "#ff7a00",
    "#ffd400",
    "#4ade80",
    "#22d3ee",
    "#3b82f6",
    "#a855f7",
    "#ff4fa3",
];

export function hsvFromHex(hex: string | null): Hsv {
    const rgb = hex ? hexToRgb(hex) : null;
    if (!rgb) return { h: 0, s: 1, v: 1 };
    return rgbToHsv(...rgb);
}

export function hexFromHsv(hsv: Hsv): string {
    return rgbToHex(...hsvToRgb(hsv));
}

/** The colour of the light at full brightness, for swatches and glows. */
export function hueHex(hsv: Hsv): string {
    return hexFromHsv({ ...hsv, v: 1 });
}

/** Approximates what the lamp looks like in white mode at a given temperature. */
export function whiteHex(colorTemp: number | null): string {
    const percent = Math.min(100, Math.max(0, colorTemp ?? 50));
    const [from, to] =
        percent <= 50 ? [WHITE_STOPS[0]!, WHITE_STOPS[1]!] : [WHITE_STOPS[1]!, WHITE_STOPS[2]!];
    const ratio = percent <= 50 ? percent / 50 : (percent - 50) / 50;

    const a = hexToRgb(from)!;
    const b = hexToRgb(to)!;
    return rgbToHex(
        a[0] + (b[0] - a[0]) * ratio,
        a[1] + (b[1] - a[1]) * ratio,
        a[2] + (b[2] - a[2]) * ratio,
    );
}

export function isColourMode(state: DeviceState): boolean {
    return state.workMode === "colour" && state.colorHex !== null;
}

/** The colour the device is showing right now, whichever mode it is in. */
export function currentHex(state: DeviceState): string {
    return isColourMode(state) ? hueHex(hsvFromHex(state.colorHex)) : whiteHex(state.colorTemp);
}

/**
 * In colour mode the lamp takes its brightness from the value channel of `colour_data`;
 * the brightness data point only drives white mode, so each mode reads its own source.
 */
export function effectiveBrightness(state: DeviceState): number | null {
    if (isColourMode(state)) return Math.max(1, Math.round(hsvFromHex(state.colorHex).v * 100));
    return state.brightness;
}

export function brightnessCommand(state: DeviceState, percent: number): DeviceCommand {
    if (!isColourMode(state)) return { brightness: percent };
    return { colorHex: hexFromHsv({ ...hsvFromHex(state.colorHex), v: percent / 100 }) };
}

/** True when two colours are close enough that the difference came from rounding. */
export function sameColor(a: Hsv, b: Hsv): boolean {
    const hueGap = Math.abs(a.h - b.h);
    return (
        Math.min(hueGap, 360 - hueGap) < 6 &&
        Math.abs(a.s - b.s) < 0.04 &&
        Math.abs(a.v - b.v) < 0.04
    );
}
