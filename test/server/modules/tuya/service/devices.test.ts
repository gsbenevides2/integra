import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";

import { mockTuyaFetch, setTuyaEnv } from "../../../../helpers/tuya-cloud";
import { fakeDbResults, installFakeDb, resetFakeDb } from "../../../../helpers/tuya-db";

let restoreDb: () => void;
let restoreEnv: () => void;
let DeviceService: typeof import("@server/modules/tuya/service/devices").DeviceService;

beforeAll(async () => {
  restoreEnv = setTuyaEnv();
  restoreDb = await installFakeDb();
  ({ DeviceService } = await import("@server/modules/tuya/service/devices"));
});
afterAll(() => {
  restoreDb();
  restoreEnv();
});
beforeEach(resetFakeDb);

const lamp = { id: "1", tuyaDeviceId: "t1", kind: "lamp" } as never;
const sw = { id: "2", tuyaDeviceId: "t2", kind: "switch" } as never;

test("class can be constructed (explicit ctor)", () => {
  expect(new (DeviceService as never as new () => object)()).toBeDefined();
});

test("reads: list, listEnabled, get, getByTuyaId, getOrThrow", async () => {
  fakeDbResults.push([{ id: "1" }], [{ id: "2" }], [{ id: "3" }], [], [{ id: "4" }], [], [{ id: "5" }], []);
  expect(await DeviceService.list()).toEqual([{ id: "1" }]);
  expect(await DeviceService.listEnabled()).toEqual([{ id: "2" }]);
  expect(await DeviceService.get("3")).toEqual({ id: "3" });
  expect(await DeviceService.get("x")).toBeNull();
  expect(await DeviceService.getByTuyaId("t")).toEqual({ id: "4" });
  expect(await DeviceService.getByTuyaId("t")).toBeNull();
  expect(await DeviceService.getOrThrow("5")).toEqual({ id: "5" });
  await expect(DeviceService.getOrThrow("nope")).rejects.toThrow("Device nope not found");
});

test("create applies defaults and throws when nothing returned", async () => {
  fakeDbResults.push([{ id: "n" }], []);
  expect(await DeviceService.create({ name: "a", tuyaDeviceId: "t" })).toEqual({ id: "n" });
  await expect(DeviceService.create({ name: "a", tuyaDeviceId: "t", kind: "switch", channelCount: 2, enabled: false })).rejects.toThrow("Device not created");
});

test("update: no-op falls back to get, otherwise updates", async () => {
  fakeDbResults.push([{ id: "same" }], [{ id: "upd" }], []);
  expect(await DeviceService.update("1", {})).toEqual({ id: "same" });
  expect(
    await DeviceService.update("1", {
      name: "n",
      tuyaDeviceId: "t",
      kind: "lamp",
      channelCount: 1,
      enabled: true,
      hidden: false,
    }),
  ).toEqual({ id: "upd" });
  expect(await DeviceService.update("1", { name: "n" })).toBeNull();
});

test("delete", async () => {
  await DeviceService.delete("1");
});

test("readState reads status and detail", async () => {
  const { spy } = mockTuyaFetch(({ path }) =>
    path.includes("/status")
      ? { success: true, result: [{ id: "t1", status: [{ code: "switch_led", value: true }] }, { id: "t2", status: [{ code: "switch_1", value: true }] }] }
      : { success: true, result: { online: true } },
  );
  expect((await DeviceService.readState(lamp)).power).toBe(true);
  expect((await DeviceService.readState(sw)).channels).toEqual({ "1": true });
  spy.mockRestore();
});

test("readAllStates", async () => {
  expect((await DeviceService.readAllStates([])).size).toBe(0);
  const { spy } = mockTuyaFetch(() => ({
    success: true,
    result: [{ id: "t1", status: [{ code: "switch_led", value: true }] }],
  }));
  const states = await DeviceService.readAllStates([lamp, sw]);
  expect(states.get("1")!.power).toBe(true);
  expect(states.get("2")!.online).toBe(false);
  spy.mockRestore();
});

function cloud(status: unknown[]) {
  return mockTuyaFetch(({ path }) =>
    path.includes("/status")
      ? { success: true, result: [{ id: "t1", status }, { id: "t2", status }] }
      : { success: true, result: true },
  );
}

test("command on a lamp merges the commanded values into the previous state", async () => {
  const { calls, spy } = cloud([
    { code: "switch_led", value: false },
    { code: "bright_value_v2", value: 500 },
    { code: "temp_value_v2", value: 500 },
    { code: "colour_data_v2", value: { h: 0, s: 1000, v: 1000 } },
    { code: "work_mode", value: "white" },
  ]);
  const a = await DeviceService.command(lamp, { power: true, brightness: 100 });
  expect(a).toMatchObject({ power: true, workMode: "white" });
  expect(calls.at(-1)!.method).toBe("POST");
  const b = await DeviceService.command(lamp, { colorHex: "#ff0000" });
  expect(b).toMatchObject({ colorHex: "#ff0000", workMode: "colour" });
  const c = await DeviceService.command(lamp, { colorTemp: 10, colorHex: undefined });
  expect(c.workMode).toBe("white");
  const d = await DeviceService.command(lamp, { workMode: "music" });
  expect(d.workMode).toBe("music");
  const e = await DeviceService.command(lamp, { power: true });
  expect(e.workMode).toBe("white");
  spy.mockRestore();
});

test("command on a lamp with nothing supported throws", async () => {
  const { spy } = cloud([{ code: "switch_led", value: true }]);
  await expect(DeviceService.command(lamp, { brightness: 5 })).rejects.toThrow("No supported command");
  spy.mockRestore();
});

test("command on a switch drives channels", async () => {
  const { calls, spy } = cloud([
    { code: "switch_1", value: false },
    { code: "switch_2", value: false },
  ]);
  expect((await DeviceService.command(sw, { channels: { "2": true } })).channels).toEqual({ "1": false, "2": true });
  expect((await DeviceService.command(sw, { power: true })).channels).toEqual({ "1": true, "2": false });
  expect(calls.at(-1)!.body).toEqual({ commands: [{ code: "switch_1", value: true }] });
  await expect(DeviceService.command(sw, { brightness: 5 })).rejects.toThrow("No supported command");
  await expect(DeviceService.command(sw, { channels: {} })).rejects.toThrow("No supported command");
  spy.mockRestore();
});
