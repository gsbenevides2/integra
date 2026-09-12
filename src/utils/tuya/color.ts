export interface Hsv {
    /** 0-360 */
    h: number;
    /** 0-1 */
    s: number;
    /** 0-1 */
    v: number;
}

/**
 * Tuya bulbs encode colour as a hex string in one of two shapes:
 * `rrggbbhhhhssvv` on type A bulbs and `hhhhssssvvvv` on type B bulbs.
 */
export type ColorEncoding = "rgb8" | "hsv16";

export function encodingForBulbType(bulbType: "A" | "B" | "C"): ColorEncoding {
    return bulbType === "A" ? "rgb8" : "hsv16";
}

export function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    const [r, g, b] =
        h < 60
            ? [c, x, 0]
            : h < 120
              ? [x, c, 0]
              : h < 180
                ? [0, c, x]
                : h < 240
                  ? [0, x, c]
                  : h < 300
                    ? [x, 0, c]
                    : [c, 0, x];

    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;

    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
        if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
        else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
        else h = 60 * ((rn - gn) / delta + 4);
    }
    if (h < 0) h += 360;

    return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hexToRgb(hex: string): [number, number, number] | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return null;
    const value = parseInt(match[1]!, 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
    const part = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
    return `#${part(r)}${part(g)}${part(b)}`;
}

/** Builds the `colour_data` string a bulb expects from a `#rrggbb` colour. */
export function hexToTuyaColor(hex: string, encoding: ColorEncoding): string | null {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;

    const hsv = rgbToHsv(...rgb);
    const h = clamp(Math.round(hsv.h), 0, 360);

    if (encoding === "hsv16") {
        const s = clamp(Math.round(hsv.s * 1000), 0, 1000);
        const v = clamp(Math.round(hsv.v * 1000), 0, 1000);
        return hexWord(h) + hexWord(s) + hexWord(v);
    }

    const s = clamp(Math.round(hsv.s * 255), 0, 255);
    const v = clamp(Math.round(hsv.v * 255), 0, 255);
    return rgb.map(hexByte).join("") + hexWord(h) + hexByte(s) + hexByte(v);
}

/** Reads a `colour_data` string back into a `#rrggbb` colour. */
export function tuyaColorToHex(value: string): string | null {
    const raw = value.trim().toLowerCase();

    if (raw.length === 12 && /^[0-9a-f]+$/.test(raw)) {
        const h = parseInt(raw.slice(0, 4), 16);
        const s = parseInt(raw.slice(4, 8), 16) / 1000;
        const v = parseInt(raw.slice(8, 12), 16) / 1000;
        return rgbToHex(...hsvToRgb({ h: clamp(h, 0, 360), s: clamp(s, 0, 1), v: clamp(v, 0, 1) }));
    }

    if (raw.length === 14 && /^[0-9a-f]+$/.test(raw)) {
        return `#${raw.slice(0, 6)}`;
    }

    return null;
}

function hexByte(value: number): string {
    return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function hexWord(value: number): string {
    return clamp(Math.round(value), 0, 0xffff).toString(16).padStart(4, "0");
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
