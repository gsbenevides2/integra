import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

import { createFakeDb } from "../../../../helpers/tplink-db";

const fake = createFakeDb();
let C: typeof import("@server/modules/tplink/service/checks").TpLinkChecksService;

beforeAll(async () => {
  mock.module("@server/db", () => ({ db: fake.db }));
  C = (await import("@server/modules/tplink/service/checks")).TpLinkChecksService;
});
afterAll(() => mock.restore());
beforeEach(() => fake.reset());

test("abstract class constructor", () => {
  expect(new (C as any)()).toBeDefined();
});

test("getLatestCheck throws when none", async () => {
  fake.queue([]);
  await expect(C.getLatestCheck()).rejects.toThrow("No checks found");
});

test("getLatestCheck returns devices", async () => {
  fake.queue([{ id: "c1", createdAt: new Date(5) }], [{ mac: "a" }]);
  expect(await C.getLatestCheck()).toEqual({ id: "c1", createdAt: 5, devices: [{ mac: "a" }] });
});

test("getDeviceHistory: no checks", async () => {
  fake.queue([{ mac: "m", name: "eth" }], []);
  expect(await C.getDeviceHistory("d", { from: 0, to: 1 })).toEqual([]);
});

test("getDeviceHistory: online/offline mapping and defaults", async () => {
  fake.queue(
    [
      { mac: "m1", name: "eth" },
      { mac: "m2", name: "wifi" },
    ],
    [
      { id: "c1", createdAt: new Date(10) },
      { id: "c2", createdAt: new Date(20) },
    ],
    [
      { checkId: "c1", mac: "m1", routerInterface: "Cabeada" },
      { checkId: "c1", mac: "m2", routerInterface: null },
    ],
  );
  const r = await C.getDeviceHistory("d", { from: 0, to: 30 });
  expect(r[0]).toEqual({
    checkId: "c1",
    createdAt: 10,
    online: true,
    interfaces: [
      { mac: "m1", name: "eth", routerInterface: "Cabeada" },
      { mac: "m2", name: "wifi", routerInterface: "Unknown" },
    ],
  });
  expect(r[1]).toEqual({ checkId: "c2", createdAt: 20, online: false, interfaces: [] });
});

test("getDeviceHistory: device without interfaces skips lookup; unknown mac falls back", async () => {
  fake.queue([], [{ id: "c1", createdAt: new Date(1) }]);
  const r = await C.getDeviceHistory("d", { from: 0, to: 2 });
  expect(r[0]!.online).toBe(false);

  fake.reset();
  fake.queue([{ mac: "m1", name: "n" }], [{ id: "c1", createdAt: new Date(1) }], [
    { checkId: "c1", mac: "zz", routerInterface: "x" },
  ]);
  const r2 = await C.getDeviceHistory("d", { from: 0, to: 2 });
  expect(r2[0]!.interfaces[0]!.name).toBe("zz");
});
