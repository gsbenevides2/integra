import {
  brightnessCommand,
  currentHex,
  effectiveBrightness,
  hexFromHsv,
  hsvFromHex,
  hueHex,
  isColourMode,
  sameColor,
  whiteHex,
} from "@public/dashboards/tuya/lampColor";
import type { DeviceState } from "@public/dashboards/tuya/types";

import { expect, test } from "bun:test";

const base: DeviceState = {
  online: true,
  power: true,
  brightness: 40,
  colorTemp: 50,
  colorHex: null,
  workMode: "white",
  channels: null,
};
const colour: DeviceState = { ...base, workMode: "colour", colorHex: "#00ff00" };

test("hsv/hex round trip and null fallback", () => {
  expect(hsvFromHex(null)).toEqual({ h: 0, s: 1, v: 1 });
  expect(hsvFromHex("not-a-hex")).toEqual({ h: 0, s: 1, v: 1 });
  expect(hexFromHsv(hsvFromHex("#00ff00"))).toBe("#00ff00");
  expect(hueHex({ h: 120, s: 1, v: 0.2 })).toBe("#00ff00");
});

test("whiteHex interpolates and clamps", () => {
  expect(whiteHex(0)).toBe("#ffb46b");
  expect(whiteHex(50)).toBe("#f6f1ea");
  expect(whiteHex(100)).toBe("#8ec2ff");
  expect(whiteHex(null)).toBe("#f6f1ea");
  expect(whiteHex(-20)).toBe("#ffb46b");
  expect(whiteHex(25)).not.toBe(whiteHex(75));
});

test("mode helpers", () => {
  expect(isColourMode(colour)).toBe(true);
  expect(isColourMode({ ...colour, colorHex: null })).toBe(false);
  expect(isColourMode(base)).toBe(false);
  expect(currentHex(colour)).toBe("#00ff00");
  expect(currentHex(base)).toBe("#f6f1ea");
  expect(effectiveBrightness({ ...colour, colorHex: "#000000" })).toBe(1);
  expect(effectiveBrightness(colour)).toBe(100);
  expect(effectiveBrightness(base)).toBe(40);
});

test("brightnessCommand picks the channel for the mode", () => {
  expect(brightnessCommand(base, 70)).toEqual({ brightness: 70 });
  expect(brightnessCommand(colour, 50)).toEqual({ colorHex: "#008000" });
});

test("sameColor tolerates rounding and hue wraparound", () => {
  expect(sameColor({ h: 359, s: 1, v: 1 }, { h: 2, s: 1, v: 1 })).toBe(true);
  expect(sameColor({ h: 0, s: 1, v: 1 }, { h: 90, s: 1, v: 1 })).toBe(false);
  expect(sameColor({ h: 0, s: 1, v: 1 }, { h: 0, s: 0.5, v: 1 })).toBe(false);
  expect(sameColor({ h: 0, s: 1, v: 1 }, { h: 0, s: 1, v: 0.5 })).toBe(false);
});
