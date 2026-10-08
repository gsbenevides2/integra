import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

import { createFakeDb } from "../../../../helpers/tplink-db";

const fake = createFakeDb();
let S: typeof import("@server/modules/tplink/service/settings").TpLinkSettingsService;

beforeAll(async () => {
  mock.module("@server/db", () => ({ db: fake.db }));
  S = (await import("@server/modules/tplink/service/settings")).TpLinkSettingsService;
});
afterAll(() => mock.restore());
beforeEach(() => fake.reset());

test("abstract class constructor", () => {
  expect(new (S as any)()).toBeDefined();
});

test("saveRouterStatus upserts stringified values, skips empty", async () => {
  await S.saveRouterStatus({});
  expect(fake.calls).toHaveLength(0);
  await S.saveRouterStatus({ wanIp: "1.1.1.1", cpuUsage: 3, totalUpload: null });
  const values = fake.calls.find((c) => c.method === "values")!.args[0];
  expect(values).toEqual([
    { key: "wanIp", value: "1.1.1.1" },
    { key: "cpuUsage", value: "3" },
    { key: "totalUpload", value: "" },
  ]);
});

test("getLatestRouterStatus maps rows with defaults", async () => {
  fake.queue([
    { key: "wanIp", value: "9.9.9.9" },
    { key: "cpuUsage", value: "12" },
    { key: "memoryUsage", value: "40" },
    { key: "totalDownload", value: "1 GB" },
  ]);
  const s = await S.getLatestRouterStatus();
  expect(s.wanIp).toBe("9.9.9.9");
  expect(s.cpuUsage).toBe(12);
  expect(s.memoryUsage).toBe(40);
  expect(s.totalDownload).toBe("1 GB");
  expect(s.totalUpload).toBeNull();
  fake.queue([]);
  const e = await S.getLatestRouterStatus();
  expect(e.cpuUsage).toBeNull();
  expect(e.memoryUsage).toBeNull();
  expect(e.firmwareVersion).toBe("");
});

test("saveRouterStatusHistory inserts", async () => {
  await S.saveRouterStatusHistory({ cpuUsage: 1, memoryUsage: 2, connectionStatus: "Connected" });
  expect(fake.calls.find((c) => c.method === "values")!.args[0]).toEqual({
    cpuUsage: 1,
    memoryUsage: 2,
    connectionStatus: "Connected",
  });
});

test("getRouterStatusHistory paginates", async () => {
  const d1 = new Date("2026-01-02T00:00:00Z");
  const d2 = new Date("2026-01-01T00:00:00Z");
  fake.queue([{ collectedAt: d1 }, { collectedAt: d2 }]);
  const r = await S.getRouterStatusHistory(new Date());
  expect(r.snapshots.map((s) => s.collectedAt)).toEqual([d2, d1]);
  expect(r.hasMore).toBe(false);
  expect(r.nextCursor).toBe(d2.toISOString());

  fake.queue(Array.from({ length: 200 }, () => ({ collectedAt: d1 })));
  expect((await S.getRouterStatusHistory()).hasMore).toBe(true);

  fake.queue([]);
  const empty = await S.getRouterStatusHistory();
  expect(empty.nextCursor).toBeNull();
});
