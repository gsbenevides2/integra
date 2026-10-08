import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";

import { mockTuyaFetch, setTuyaEnv } from "../../../../helpers/tuya-cloud";
import { fakeDbResults, installFakeDb, resetFakeDb } from "../../../../helpers/tuya-db";

let restoreDb: () => void;
let restoreEnv: () => void;
let PresetService: typeof import("@server/modules/tuya/service/presets").PresetService;

beforeAll(async () => {
  restoreEnv = setTuyaEnv();
  restoreDb = await installFakeDb();
  ({ PresetService } = await import("@server/modules/tuya/service/presets"));
});
afterAll(() => {
  restoreDb();
  restoreEnv();
});
beforeEach(resetFakeDb);

test("class can be constructed (explicit ctor)", () => {
  expect(new (PresetService as never as new () => object)()).toBeDefined();
});

test("reads", async () => {
  fakeDbResults.push([{ id: "1" }], [{ id: "2" }], [], [{ id: "3" }], []);
  expect(await PresetService.list()).toEqual([{ id: "1" }]);
  expect(await PresetService.get("2")).toEqual({ id: "2" });
  expect(await PresetService.get("x")).toBeNull();
  expect(await PresetService.getOrThrow("3")).toEqual({ id: "3" });
  await expect(PresetService.getOrThrow("x")).rejects.toThrow("Preset x not found");
});

test("create", async () => {
  fakeDbResults.push([{ id: "n" }], []);
  expect(await PresetService.create({ name: "a" })).toEqual({ id: "n" });
  await expect(
    PresetService.create({ name: "a", power: false, brightness: 1, colorTemp: 2, colorHex: "#000000", workMode: "white" }),
  ).rejects.toThrow("Preset not created");
});

test("update", async () => {
  fakeDbResults.push([{ id: "same" }], [{ id: "upd" }], []);
  expect(await PresetService.update("1", {})).toEqual({ id: "same" });
  expect(
    await PresetService.update("1", { name: "n", power: true, brightness: 1, colorTemp: 1, colorHex: null, workMode: null }),
  ).toEqual({ id: "upd" });
  expect(await PresetService.update("1", { name: "n" })).toBeNull();
});

test("delete", async () => {
  await PresetService.delete("1");
});

test("apply builds the right command per preset shape", async () => {
  const { calls, spy } = mockTuyaFetch(({ path }) =>
    path.includes("/status")
      ? {
          success: true,
          result: [{
            id: "t1",
            status: [
              { code: "switch_led", value: true },
              { code: "bright_value", value: 100 },
              { code: "temp_value", value: 100 },
              { code: "colour_data", value: { h: 0, s: 255, v: 255 } },
            ],
          }],
        }
      : { success: true, result: true },
  );
  const device = { id: "d", tuyaDeviceId: "t1", kind: "lamp" };
  const run = async (preset: object) => {
    fakeDbResults.push([preset], [device]);
    await PresetService.apply("p", "d");
    return calls.at(-1)!.body;
  };
  expect(await run({ power: true, workMode: "colour", colorHex: "#ff0000", brightness: 5 })).toEqual({
    commands: [
      { code: "switch_led", value: true },
      { code: "colour_data", value: { h: 0, s: 255, v: 255 } },
    ],
  });
  expect(await run({ power: false, workMode: "white", colorHex: null, colorTemp: 100, brightness: 100 })).toEqual({
    commands: [
      { code: "switch_led", value: false },
      { code: "bright_value", value: 255 },
      { code: "temp_value", value: 255 },
    ],
  });
  expect(await run({ power: true, colorHex: null, colorTemp: null, brightness: null })).toEqual({
    commands: [{ code: "switch_led", value: true }],
  });
  spy.mockRestore();
});
