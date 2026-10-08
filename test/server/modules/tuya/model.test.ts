import {
  commandBody,
  OFFLINE_STATE,
  percentToRaw,
  presetBody,
  sensorUpdateBody,
  statesEqual,
} from "@server/modules/tuya/model";

import { expect, test } from "bun:test";

test("statesEqual compares every field including channels", () => {
  expect(statesEqual(OFFLINE_STATE, { ...OFFLINE_STATE })).toBe(true);
  expect(statesEqual(OFFLINE_STATE, { ...OFFLINE_STATE, power: true })).toBe(false);
  expect(
    statesEqual(
      { ...OFFLINE_STATE, channels: { "1": true } },
      { ...OFFLINE_STATE, channels: { "1": false } },
    ),
  ).toBe(false);
});

test("percentToRaw clamps and scales", () => {
  expect(percentToRaw(50, 0, 1000)).toBe(500);
  expect(percentToRaw(-5, 10, 1000)).toBe(10);
  expect(percentToRaw(500, 10, 1000)).toBe(1000);
});

test("commandBody requires at least one field and a valid colour", () => {
  expect(commandBody.safeParse({}).success).toBe(false);
  expect(commandBody.safeParse({ power: true }).success).toBe(true);
  expect(commandBody.safeParse({ colorHex: "red" }).success).toBe(false);
});

test("other schemas parse", () => {
  expect(presetBody.safeParse({ name: "a", workMode: "scene" }).success).toBe(false);
  expect(sensorUpdateBody.safeParse({ enabled: true }).success).toBe(true);
});
