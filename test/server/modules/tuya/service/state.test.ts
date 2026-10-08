import { OFFLINE_STATE } from "@server/modules/tuya/model";

import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";

import { setTuyaEnv } from "../../../../helpers/tuya-cloud";
import { fakeDbCalls, fakeDbResults, installFakeDb, resetFakeDb } from "../../../../helpers/tuya-db";

let restoreEnv: () => void;
let restoreDb: () => void;
let StateService: typeof import("@server/modules/tuya/service/state").StateService;
let tuyaEvents: typeof import("@server/modules/tuya/events").tuyaEvents;

beforeAll(async () => {
  restoreEnv = setTuyaEnv();
  restoreDb = await installFakeDb();
  ({ StateService } = await import("@server/modules/tuya/service/state"));
  ({ tuyaEvents } = await import("@server/modules/tuya/events"));
});
afterAll(() => {
  restoreDb();
  restoreEnv();
});
beforeEach(resetFakeDb);

const row = (over: object = {}) => ({
  online: true, power: true, brightness: 10, colorTemp: 20, colorHex: "#ffffff",
  workMode: "white", channels: null, recordedAt: new Date("2026-01-01T00:00:00Z"), ...over,
});

test("class can be constructed (explicit ctor)", () => {
  expect(new (StateService as never as new () => object)()).toBeDefined();
});

test("getLatestState maps rows, including channels and null workMode", async () => {
  fakeDbResults.push([row({ channels: '{"1":true}', workMode: null })], []);
  expect(await StateService.getLatestState("d")).toMatchObject({ channels: { "1": true }, workMode: null });
  expect(await StateService.getLatestState("d")).toBeNull();
});

test("saveStateIfChanged skips equal states", async () => {
  fakeDbResults.push([row({ workMode: "white" })]);
  const same = { online: true, power: true, brightness: 10, colorTemp: 20, colorHex: "#ffffff", workMode: "white" as const, channels: null };
  expect(await StateService.saveStateIfChanged("d", same)).toBe(false);
});

test("saveStateIfChanged inserts and emits the change event", async () => {
  const events: any[] = [];
  const off = tuyaEvents.onDeviceChange((e) => events.push(e));
  // latest (none), device lookup, insert
  fakeDbResults.push([], [{ id: "d" }]);
  expect(await StateService.saveStateIfChanged("d", { ...OFFLINE_STATE, channels: { "1": true } })).toBe(true);
  expect(events).toHaveLength(1);
  expect(events[0].changed).toEqual([]);
  expect(fakeDbCalls.some((c) => c.method === "insert")).toBe(true);

  // changed vs. previous, with device found
  fakeDbResults.push([row()], [{ id: "d" }]);
  await StateService.saveStateIfChanged("d", { ...OFFLINE_STATE, power: false });
  expect(events[1].changed).toContain("online");
  off();
});

test("saveStateIfChanged still inserts when the device no longer exists", async () => {
  const events: unknown[] = [];
  const off = tuyaEvents.onDeviceChange((e) => events.push(e));
  fakeDbResults.push([], []);
  expect(await StateService.saveStateIfChanged("gone", OFFLINE_STATE)).toBe(true);
  expect(events).toHaveLength(0);
  off();
});

test("getStateHistory paginates oldest first", async () => {
  const many = Array.from({ length: 201 }, (_, i) => row({ recordedAt: new Date(2026, 0, 1, 0, 0, 201 - i) }));
  fakeDbResults.push(many, [row()], []);
  const page = await StateService.getStateHistory("d");
  expect(page.hasMore).toBe(true);
  expect(page.snapshots).toHaveLength(200);
  expect(page.nextCursor).toBe(many[199]!.recordedAt.toISOString());
  expect(page.snapshots[0]!.recordedAt < page.snapshots[199]!.recordedAt).toBe(true);

  const last = await StateService.getStateHistory("d", new Date());
  expect(last).toMatchObject({ hasMore: false, nextCursor: null });
  const empty = await StateService.getStateHistory("d");
  expect(empty.snapshots).toEqual([]);
});

test("pruneStateHistory deletes", async () => {
  await StateService.pruneStateHistory(new Date());
  expect(fakeDbCalls.some((c) => c.method === "delete")).toBe(true);
});
