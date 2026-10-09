import { encryptRouterPassword } from "@server/modules/tplink/service/passwordCrypto";

import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

import { createFakeDb } from "../../../../helpers/tplink-db";

const fake = createFakeDb();
let D: typeof import("@server/modules/tplink/service/devices").TpLinkDeviceService;
const oldSecret = process.env.ROUTER_PASSWORD_SECRET;

beforeAll(async () => {
  process.env.ROUTER_PASSWORD_SECRET = "test-secret";
  mock.module("@server/db", () => ({ db: fake.db }));
  D = (await import("@server/modules/tplink/service/devices")).TpLinkDeviceService;
});
afterAll(() => {
  if (oldSecret === undefined) delete process.env.ROUTER_PASSWORD_SECRET;
  else process.env.ROUTER_PASSWORD_SECRET = oldSecret;
});
beforeEach(() => fake.reset());

test("abstract class constructor", () => {
  expect(new (D as any)()).toBeDefined();
});

const sets = () => fake.calls.filter((c) => c.method === "set").map((c) => c.args[0] as any);

test("listDevices groups interfaces and hides password", async () => {
  fake.queue(
    [{ id: "d1", routerPassword: "x" }, { id: "d2" }],
    [{ id: "i1", deviceId: "d1" }, { id: "i2", deviceId: "d1" }],
  );
  const r = await D.listDevices();
  expect(r[0]!.interfaces).toHaveLength(2);
  expect(r[0]!.routerPassword).toBeUndefined();
  expect(r[1]!.interfaces).toEqual([]);
});

test("createDevice: controller router demotes others and encrypts password", async () => {
  fake.queue(undefined, [{ id: "new" }]);
  const r = await D.createDevice({ name: "n", brand: "b", type: "router", isController: true, routerPassword: "pw" });
  expect(r).toEqual({ id: "new" });
  expect(sets()[0]).toEqual({ isController: false });
  const values = fake.calls.find((c) => c.method === "values")!.args[0] as any;
  expect(values.routerPassword).toContain(":");
});

test("createDevice: client without password; missing id throws", async () => {
  fake.queue([]);
  await expect(D.createDevice({ name: "n", brand: "b", type: "client" })).rejects.toThrow("Id not generated");
  expect(sets()).toHaveLength(0);
});

test("updateDevice: password variants", async () => {
  await D.updateDevice("1", { type: "router", isController: true, routerPassword: "pw" });
  expect(sets()[0]).toEqual({ isController: false });
  expect(sets()[1].routerPassword).toContain(":");

  fake.reset();
  await D.updateDevice("1", { routerPassword: null });
  expect(sets()[0]).toEqual({ routerPassword: null });

  fake.reset();
  await D.updateDevice("1", { name: "x" });
  expect(sets()[0]).toEqual({ name: "x" });
});

test("delete device/interface", async () => {
  await D.deleteDevice("1");
  expect(fake.calls.filter((c) => c.method === "delete")).toHaveLength(2);
  fake.reset();
  await D.deleteInterface("i");
  expect(fake.calls.filter((c) => c.method === "delete")).toHaveLength(1);
});

test("createInterface rules", async () => {
  fake.queue([]);
  await expect(D.createInterface("d", { name: "n", mac: "m", ip: "i" })).rejects.toThrow("Device not found");

  fake.queue([{ type: "router" }], [{ id: "x" }]);
  await expect(D.createInterface("d", { name: "n", mac: "m", ip: "i" })).rejects.toThrow("only have one");

  fake.queue([{ type: "router" }], [], [{ id: "ni" }]);
  expect(await D.createInterface("d", { name: "n", mac: "m", ip: "i" })).toEqual({ id: "ni" });

  fake.queue([{ type: "client" }], []);
  await expect(D.createInterface("d", { name: "n", mac: "m", ip: "i" })).rejects.toThrow("Id not generated");
});

test("updateInterface rules", async () => {
  fake.queue([{ type: "router", isController: true }]);
  await expect(D.updateInterface("d", "i", { ip: "1" })).rejects.toThrow("Controller");

  fake.reset();
  fake.queue([{ type: "router", isController: false }]);
  await D.updateInterface("d", "i", { ip: "1.1.1.1", reservedIp: true, mac: "ignored" });
  expect(sets()[0]).toEqual({ ip: "1.1.1.1", reservedIp: true });

  fake.reset();
  fake.queue([{ type: "router", isController: false }]);
  await D.updateInterface("d", "i", { mac: "m" });
  expect(sets()[0]).toEqual({});

  fake.reset();
  fake.queue([{ type: "client" }]);
  await D.updateInterface("d", "i", { mac: "m" });
  expect(sets()[0]).toEqual({ mac: "m" });
});

test("getDeviceNamesByMacs", async () => {
  expect(await D.getDeviceNamesByMacs([])).toEqual(new Map());
  expect(fake.calls).toHaveLength(0);
  fake.queue([]);
  expect((await D.getDeviceNamesByMacs(["m"])).size).toBe(0);
  fake.queue([{ mac: "m", name: "Phone" }, { mac: "n", name: "TV" }]);
  expect(await D.getDeviceNamesByMacs(["m", "n"])).toEqual(new Map([["m", "Phone"], ["n", "TV"]]));
});

test("getControllerRouter", async () => {
  fake.queue([{ id: "1", isController: false }]);
  expect(await D.getControllerRouter()).toBeNull();
  fake.queue([{ id: "1", isController: true, routerPassword: null }]);
  expect(await D.getControllerRouter()).toBeNull();
  fake.queue([{ id: "1", isController: true, routerPassword: "x" }], []);
  expect(await D.getControllerRouter()).toBeNull();
  const enc = await encryptRouterPassword("secret");
  fake.queue([{ id: "1", name: "R", isController: true, routerPassword: enc }], [{ ip: "10.0.0.1" }]);
  expect(await D.getControllerRouter()).toEqual({ id: "1", name: "R", ip: "10.0.0.1", password: "secret" });
});

test("getAllRouters filters incomplete routers", async () => {
  const enc = await encryptRouterPassword("pw");
  fake.queue(
    [
      { id: "1", routerPassword: enc, isController: true },
      { id: "2", routerPassword: null, isController: false },
      { id: "3", routerPassword: enc, isController: false },
    ],
    [{ deviceId: "1", ip: "1.1.1.1" }, { deviceId: "2", ip: "2.2.2.2" }],
  );
  expect(await D.getAllRouters()).toEqual([{ ip: "1.1.1.1", password: "pw", isController: true }]);
});
