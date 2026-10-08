import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "@server/modules/tuya/color";

import { expect, test } from "bun:test";

test("hsvToRgb primary colors", () => {
  expect(hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual([255, 0, 0]);
  expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual([0, 255, 0]);
  expect(hsvToRgb({ h: 240, s: 1, v: 1 })).toEqual([0, 0, 255]);
  expect(hsvToRgb({ h: 0, s: 0, v: 1 })).toEqual([255, 255, 255]);
});

test("rgbToHsv known values", () => {
  expect(rgbToHsv(255, 0, 0)).toEqual({ h: 0, s: 1, v: 1 });
  expect(rgbToHsv(0, 0, 255)).toEqual({ h: 240, s: 1, v: 1 });
  expect(rgbToHsv(0, 0, 0)).toEqual({ h: 0, s: 0, v: 0 });
});

test("rgb -> hsv -> rgb round-trips", () => {
  for (const rgb of [[12, 200, 90], [255, 128, 0], [30, 30, 30], [250, 5, 180]] as const) {
    expect(hsvToRgb(rgbToHsv(...rgb))).toEqual([...rgb]);
  }
});

test("hexToRgb / rgbToHex", () => {
  expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
  expect(hexToRgb(" FF8000 ")).toEqual([255, 128, 0]);
  expect(hexToRgb("#fff")).toBeNull();
  expect(hexToRgb("zzzzzz")).toBeNull();
  expect(rgbToHex(255, 128, 0)).toBe("#ff8000");
  expect(rgbToHex(300, -5, 0.4)).toBe("#ff0000");
});
