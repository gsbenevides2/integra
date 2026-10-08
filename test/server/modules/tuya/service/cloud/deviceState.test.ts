import { OFFLINE_STATE } from "@server/modules/tuya/model";
import {
  cloudStatusToDeviceState,
  cloudStatusToSwitchState,
  detectCloudCodes,
  deviceCommandToCloudCommands,
  switchChannelsToCloudCommands,
} from "@server/modules/tuya/service/cloud/deviceState";

import { expect, test } from "bun:test";

const v1 = [
  { code: "switch_led", value: true },
  { code: "bright_value", value: 255 },
  { code: "temp_value", value: 0 },
  { code: "work_mode", value: "colour" },
  { code: "colour_data", value: JSON.stringify({ h: 0, s: 255, v: 255 }) },
];
const v2 = [
  { code: "switch_led", value: false },
  { code: "bright_value_v2", value: 1000 },
  { code: "temp_value_v2", value: 500 },
  { code: "work_mode", value: "white" },
  { code: "colour_data_v2", value: { h: 120, s: 1000, v: 1000 } },
];

test("detectCloudCodes picks v1 or v2 codes", () => {
  expect(detectCloudCodes(v1)).toMatchObject({ brightness: "bright_value", brightnessMax: 255 });
  expect(detectCloudCodes(v2)).toMatchObject({ brightness: "bright_value_v2", colorMax: 1000 });
  expect(detectCloudCodes([])).toMatchObject({ brightness: null, color: null, workMode: null });
});

test("cloudStatusToDeviceState: offline cases", () => {
  expect(cloudStatusToDeviceState(v1, false)).toBe(OFFLINE_STATE);
  expect(cloudStatusToDeviceState([], true)).toBe(OFFLINE_STATE);
});

test("cloudStatusToDeviceState: v1 and v2 readings", () => {
  expect(cloudStatusToDeviceState(v1, true)).toEqual({
    online: true,
    channels: null,
    power: true,
    brightness: 100,
    colorTemp: 0,
    colorHex: "#ff0000",
    workMode: "colour",
  });
  expect(cloudStatusToDeviceState(v2, true)).toMatchObject({
    power: false,
    brightness: 100,
    colorTemp: 50,
    colorHex: "#00ff00",
    workMode: "white",
  });
});

test("cloudStatusToDeviceState tolerates missing and malformed values", () => {
  const state = cloudStatusToDeviceState(
    [
      { code: "switch_led", value: "yes" },
      { code: "bright_value", value: "x" },
      { code: "work_mode", value: "bogus" },
      { code: "colour_data", value: "not json" },
    ],
    true,
  );
  expect(state).toMatchObject({ power: null, brightness: null, colorTemp: null, colorHex: null, workMode: null });
  for (const value of [{ h: 1 }, 5, JSON.stringify(null)]) {
    expect(
      cloudStatusToDeviceState([{ code: "colour_data", value: value as never }], true).colorHex,
    ).toBeNull();
  }
});

test("deviceCommandToCloudCommands translates every field", () => {
  expect(deviceCommandToCloudCommands({ power: true, brightness: 100 }, v1)).toEqual([
    { code: "switch_led", value: true },
    { code: "bright_value", value: 255 },
  ]);
  expect(deviceCommandToCloudCommands({ colorTemp: 100 }, v2)).toEqual([
    { code: "temp_value_v2", value: 1000 },
    { code: "work_mode", value: "white" },
  ]);
  expect(deviceCommandToCloudCommands({ colorHex: "#ff0000" }, v1)).toEqual([
    { code: "colour_data", value: { h: 0, s: 255, v: 255 } },
    { code: "work_mode", value: "colour" },
  ]);
  expect(
    deviceCommandToCloudCommands({ colorHex: "#ff0000", colorTemp: 0, workMode: "music" }, v1),
  ).toEqual([
    { code: "temp_value", value: 0 },
    { code: "colour_data", value: { h: 0, s: 255, v: 255 } },
    { code: "work_mode", value: "music" },
  ]);
  expect(deviceCommandToCloudCommands({ brightness: 1, colorTemp: 1, colorHex: "#fff", workMode: "white" }, [
    { code: "switch_led", value: true },
  ])).toEqual([]);
});

test("deviceCommandToCloudCommands rejects bad colours", () => {
  expect(() => deviceCommandToCloudCommands({ colorHex: "zzz" }, v1)).toThrow("Invalid colour");
});

test("cloudStatusToSwitchState", () => {
  expect(cloudStatusToSwitchState([], true)).toBe(OFFLINE_STATE);
  expect(cloudStatusToSwitchState([{ code: "switch_led", value: true }], true)).toBe(OFFLINE_STATE);
  expect(
    cloudStatusToSwitchState(
      [
        { code: "switch_1", value: true },
        { code: "switch_2", value: "on" },
        { code: "switch_9", value: true },
        { code: "switch_0", value: true },
        { code: "switch_3", value: false },
      ],
      false,
    ),
  ).toEqual({ ...OFFLINE_STATE, online: false, channels: { "1": true, "3": false } });
});

test("switchChannelsToCloudCommands", () => {
  expect(switchChannelsToCloudCommands({ "1": true, "2": false })).toEqual([
    { code: "switch_1", value: true },
    { code: "switch_2", value: false },
  ]);
});
