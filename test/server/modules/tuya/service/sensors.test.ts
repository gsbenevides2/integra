import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";

import { setTuyaEnv } from "../../../../helpers/tuya-cloud";
import { fakeDbCalls, fakeDbResults, installFakeDb, resetFakeDb } from "../../../../helpers/tuya-db";

let restoreEnv: () => void;
let restoreDb: () => void;
let SensorService: typeof import("@server/modules/tuya/service/sensors").SensorService;

beforeAll(async () => {
  restoreEnv = setTuyaEnv();
  restoreDb = await installFakeDb();
  ({ SensorService } = await import("@server/modules/tuya/service/sensors"));
});
afterAll(() => {
  restoreDb();
  restoreEnv();
});
beforeEach(resetFakeDb);

test("class can be constructed (explicit ctor)", () => {
  expect(new (SensorService as never as new () => object)()).toBeDefined();
});

test("kindForCategory", () => {
  expect(SensorService.kindForCategory("mcs")).toBe("door");
  expect(SensorService.kindForCategory("zzz", "Smart PIR sensor")).toBe("motion");
  expect(SensorService.kindForCategory("zzz", "lamp")).toBe("unknown");
  expect(SensorService.kindForCategory("zzz")).toBe("unknown");
});

test("kindForCodes", () => {
  expect(SensorService.kindForCodes(["pir"], "unknown")).toBe("motion");
  expect(SensorService.kindForCodes(["doorcontact_state"], "unknown")).toBe("door");
  expect(SensorService.kindForCodes(["va_temperature"], "unknown")).toBe("temperature_humidity");
  expect(SensorService.kindForCodes(["va_humidity"], "unknown")).toBe("temperature_humidity");
  expect(SensorService.kindForCodes(["x"], "door")).toBe("door");
});

test("simple reads and writes", async () => {
  fakeDbResults.push([{ id: "a" }], [{ id: "b" }], [{ id: "c" }], [], [{ id: "d" }], [], [{ id: "e" }]);
  expect(await SensorService.list()).toEqual([{ id: "a" }] as never);
  expect(await SensorService.listEnabled()).toEqual([{ id: "b" }] as never);
  expect(await SensorService.get("c")).toEqual({ id: "c" } as never);
  expect(await SensorService.get("x")).toBeNull();
  expect(await SensorService.getByTuyaId("t")).toEqual({ id: "d" } as never);
  expect(await SensorService.getByTuyaId("t")).toBeNull();
  expect(await SensorService.listVisible()).toEqual([{ id: "e" }] as never);
  await SensorService.setKind("1", "door");
  await SensorService.setOnline("1", true);
  await SensorService.delete("1");
  await SensorService.setEnabled("1", true);
  await SensorService.setHidden("1", true);
  await SensorService.rename("1", "n");
  await SensorService.setLastEventAt("1", new Date());
  await SensorService.pruneReadings(new Date());
  expect(fakeDbCalls.length).toBeGreaterThan(10);
});

test("create", async () => {
  fakeDbResults.push([{ id: "n" }], []);
  expect(await SensorService.create({ tuyaDeviceId: "t", name: "n" })).toEqual({ id: "n" } as never);
  await expect(
    SensorService.create({ tuyaDeviceId: "t", name: "n", kind: "door", category: "mcs", enabled: false, hidden: true }),
  ).rejects.toThrow("Sensor not created");
});

test("saveReadings", async () => {
  expect(await SensorService.saveReadings([])).toBe(0);
  expect(await SensorService.saveReadings([{ sensorId: "s", code: "c", value: "v", recordedAt: new Date() }])).toBe(1);
});

test("latest readings keep the newest value per code", async () => {
  fakeDbResults.push([
    { sensorId: "s", code: "a", value: "new" },
    { sensorId: "s", code: "a", value: "old" },
    { sensorId: "s", code: "b", value: "x" },
  ]);
  expect(await SensorService.getLatestReadings("s")).toEqual({ a: "new", b: "x" });

  expect((await SensorService.getLatestReadingsFor([])).size).toBe(0);
  fakeDbResults.push([
    { sensorId: "s1", code: "a", value: "1" },
    { sensorId: "s1", code: "a", value: "0" },
    { sensorId: "s1", code: "b", value: "2" },
    { sensorId: "s2", code: "a", value: "3" },
  ]);
  const map = await SensorService.getLatestReadingsFor(["s1", "s2"]);
  expect(map.get("s1")).toEqual({ a: "1", b: "2" });
  expect(map.get("s2")).toEqual({ a: "3" });
});

test("getReadingHistory filters and paginates", async () => {
  const mk = (i: number) => ({ recordedAt: new Date(2026, 0, 1, 0, 0, 400 - i) });
  fakeDbResults.push(Array.from({ length: 301 }, (_, i) => mk(i)), [], []);
  const page = await SensorService.getReadingHistory("s", { code: "c", before: new Date() });
  expect(page.hasMore).toBe(true);
  expect(page.readings).toHaveLength(300);
  expect(page.nextCursor).not.toBeNull();
  expect(await SensorService.getReadingHistory("s", { code: "c" })).toMatchObject({ hasMore: false, nextCursor: null });
  expect((await SensorService.getReadingHistory("s")).readings).toEqual([]);
});

test("countReadingsSince", async () => {
  fakeDbResults.push([{ id: 1 }, { id: 2 }]);
  expect(await SensorService.countReadingsSince("s", new Date())).toBe(2);
});
