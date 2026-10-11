import { OFFLINE_STATE } from "@server/modules/tuya/model";

import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";

import { installTestAuthz } from "../../../helpers/auth";
import { setTuyaEnv } from "../../../helpers/tuya-cloud";
import { installFakeDb } from "../../../helpers/tuya-db";

const restores: (() => void)[] = [];
let routes: typeof import("@server/modules/tuya/index").tuyaRoutes;
let Device: typeof import("@server/modules/tuya/service/devices").DeviceService;
let Preset: typeof import("@server/modules/tuya/service/presets").PresetService;
let Sensor: typeof import("@server/modules/tuya/service/sensors").SensorService;
let State: typeof import("@server/modules/tuya/service/state").StateService;
const spies: { mockRestore(): void }[] = [];

beforeAll(async () => {
  restores.push(setTuyaEnv());
  restores.push(await installFakeDb());
  restores.push(await installTestAuthz());
  ({ tuyaRoutes: routes } = await import("@server/modules/tuya/index"));
  ({ DeviceService: Device } = await import("@server/modules/tuya/service/devices"));
  ({ PresetService: Preset } = await import("@server/modules/tuya/service/presets"));
  ({ SensorService: Sensor } = await import("@server/modules/tuya/service/sensors"));
  ({ StateService: State } = await import("@server/modules/tuya/service/state"));
});
afterAll(() => restores.reverse().forEach((r) => r()));
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

function spy<T extends object, K extends keyof T>(obj: T, key: K, value: unknown) {
  const s = spyOn(obj, key as never).mockImplementation((typeof value === "function" ? value : async () => value) as never);
  spies.push(s);
  return s;
}

async function call(method: string, path: string, body?: unknown) {
  const res = await routes.handle(
    new Request(`http://localhost/api/tuya${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

test("GET /devices hides hidden devices and falls back to offline state", async () => {
  const list = [{ id: "1", hidden: false }, { id: "2", hidden: true }];
  spy(Device, "list", list);
  spy(State, "getLatestStates", new Map([["2", { ...OFFLINE_STATE, power: true }]]));
  const a = await call("GET", "/devices");
  expect(a.json).toHaveLength(1);
  expect(a.json[0].state.online).toBe(false);
  const b = await call("GET", "/devices?includeHidden=true");
  expect(b.json).toHaveLength(2);
  expect(b.json[1].state.power).toBe(true);
});

test("device create/update/delete", async () => {
  spy(Device, "create", { id: "n" });
  expect((await call("POST", "/devices", { name: "a", tuyaDeviceId: "t" })).json).toEqual({ id: "n" });
  expect((await call("POST", "/devices", { name: "" })).status).toBe(422);
  const upd = spy(Device, "update", { id: "u" });
  expect((await call("PUT", "/devices/1", { name: "x" })).json).toEqual({ id: "u" });
  upd.mockImplementation((async () => null) as never);
  expect((await call("PUT", "/devices/1", { name: "x" })).status).toBe(404);
  upd.mockImplementation((async () => ({ id: "u" })) as never);
  const byTuyaId = spy(Sensor, "getByTuyaId", { id: "s" });
  expect((await call("PUT", "/devices/1", { tuyaDeviceId: "t" })).status).toBe(400);
  byTuyaId.mockImplementation((async () => null) as never);
  expect((await call("PUT", "/devices/1", { tuyaDeviceId: "t" })).json).toEqual({ id: "u" });
  spy(Device, "delete", undefined);
  expect((await call("DELETE", "/devices/1")).json).toEqual({ ok: true });
});

test("device state", async () => {
  const get = spy(Device, "get", null);
  expect((await call("GET", "/devices/1/state")).status).toBe(404);
  get.mockImplementation((async () => ({ id: "1" })) as never);
  const read = spy(Device, "readState", { ...OFFLINE_STATE, power: true });
  expect((await call("GET", "/devices/1/state")).json.power).toBe(true);
  read.mockImplementation((async () => { throw new Error("x"); }) as never);
  expect((await call("GET", "/devices/1/state")).json.online).toBe(false);
});

test("device command", async () => {
  const get = spy(Device, "get", null);
  expect((await call("POST", "/devices/1/command", { power: true })).status).toBe(404);
  get.mockImplementation((async () => ({ id: "1" })) as never);
  const cmd = spy(Device, "command", { ok: 1 });
  expect((await call("POST", "/devices/1/command", { power: true })).json).toEqual({ ok: 1 });
  cmd.mockImplementation((async () => { throw new Error("cloud down"); }) as never);
  const err = await call("POST", "/devices/1/command", { power: true });
  expect(err).toMatchObject({ status: 503, json: { error: "cloud down" } });
  cmd.mockImplementation((async () => { throw "str"; }) as never);
  expect((await call("POST", "/devices/1/command", { power: true })).json.error).toBe("str");
});

test("device history parses the cursor", async () => {
  const hist = spy(State, "getStateHistory", { snapshots: [] });
  await call("GET", "/devices/1/history");
  expect(hist.mock.calls[0]![1]).toBeUndefined();
  await call("GET", "/devices/1/history?before=2026-01-01T00:00:00.000Z");
  expect(hist.mock.calls[1]![1]).toEqual(new Date("2026-01-01T00:00:00.000Z"));
});

test("presets CRUD", async () => {
  spy(Preset, "list", [{ id: "p" }]);
  expect((await call("GET", "/presets")).json).toEqual([{ id: "p" }]);
  spy(Preset, "create", { id: "n" });
  expect((await call("POST", "/presets", { name: "a" })).json).toEqual({ id: "n" });
  const upd = spy(Preset, "update", { id: "u" });
  expect((await call("PUT", "/presets/1", { name: "b" })).json).toEqual({ id: "u" });
  upd.mockImplementation((async () => null) as never);
  expect((await call("PUT", "/presets/1", { name: "b" })).status).toBe(404);
  spy(Preset, "delete", undefined);
  expect((await call("DELETE", "/presets/1")).json).toEqual({ ok: true });
});

test("apply preset", async () => {
  const pget = spy(Preset, "get", null);
  const dget = spy(Device, "get", null);
  const body = { deviceId: "d" };
  expect((await call("POST", "/presets/p/apply", body)).json.error).toBe("Preset not found");
  pget.mockImplementation((async () => ({ id: "p" })) as never);
  expect((await call("POST", "/presets/p/apply", body)).json.error).toBe("Device not found");
  dget.mockImplementation((async () => ({ id: "d" })) as never);
  const apply = spy(Preset, "apply", { applied: true });
  expect((await call("POST", "/presets/p/apply", body)).json).toEqual({ applied: true });
  apply.mockImplementation((async () => { throw new Error("nope"); }) as never);
  expect(await call("POST", "/presets/p/apply", body)).toMatchObject({ status: 503, json: { error: "nope" } });
  apply.mockImplementation((async () => { throw 5; }) as never);
  expect((await call("POST", "/presets/p/apply", body)).json.error).toBe("5");
});

test("sensors listing, create, update, delete, history", async () => {
  spy(Sensor, "list", [{ id: "1", hidden: false }, { id: "2", hidden: false }, { id: "3", hidden: true }]);
  spy(Sensor, "getLatestReadingsFor", new Map([["1", { a: "x" }]]));
  const list = (await call("GET", "/sensors")).json;
  expect(list).toEqual([{ id: "1", hidden: false, readings: { a: "x" } }, { id: "2", hidden: false, readings: {} }]);
  expect((await call("GET", "/sensors?includeHidden=true")).json).toHaveLength(3);

  spy(Sensor, "create", { id: "n" });
  expect((await call("POST", "/sensors", { name: "a", tuyaDeviceId: "t" })).json).toEqual({ id: "n" });

  const get = spy(Sensor, "get", null);
  expect((await call("PUT", "/sensors/1", { name: "x" })).status).toBe(404);
  get.mockImplementation((async () => ({ id: "1" })) as never);
  const rename = spy(Sensor, "rename", undefined);
  const enabled = spy(Sensor, "setEnabled", undefined);
  const hidden = spy(Sensor, "setHidden", undefined);
  await call("PUT", "/sensors/1", { name: "x", enabled: false, hidden: true });
  expect([rename, enabled, hidden].map((s) => s.mock.calls.length)).toEqual([1, 1, 1]);
  await call("PUT", "/sensors/1", {});
  expect(rename.mock.calls).toHaveLength(1);

  spy(Sensor, "delete", undefined);
  expect((await call("DELETE", "/sensors/1")).json).toEqual({ ok: true });

  const hist = spy(Sensor, "getReadingHistory", { readings: [] });
  await call("GET", "/sensors/1/history");
  expect(hist.mock.calls[0]![1]).toEqual({ code: undefined, before: undefined });
  await call("GET", "/sensors/1/history?code=c&before=2026-01-01T00:00:00.000Z");
  expect(hist.mock.calls[1]![1]).toEqual({ code: "c", before: new Date("2026-01-01T00:00:00.000Z") });
});

test("a failed creator grant rolls the new resource back", async () => {
  const authzMod = await import("@server/shared/authz");
  const grant = spy(authzMod, "grantAllValidActions", async () => {
    throw new Error("db down");
  });
  const revoke = spy(authzMod, "revokeResourceGrants", undefined);
  spy(Sensor, "getByTuyaId", null);
  spy(Device, "getByTuyaId", null);
  const cases = [
    { path: "/devices", body: { name: "a", tuyaDeviceId: "t" }, svc: Device, type: "tuya_device" },
    { path: "/sensors", body: { name: "a", tuyaDeviceId: "t" }, svc: Sensor, type: "tuya_sensor" },
    { path: "/presets", body: { name: "a" }, svc: Preset, type: "tuya_preset" },
  ] as const;
  for (const { path, body, svc, type } of cases) {
    spy(svc, "create", { id: "new" });
    const remove = spy(svc, "delete", undefined);
    expect((await call("POST", path, body)).status).toBe(500);
    expect(remove).toHaveBeenCalledWith("new");
    expect(revoke).toHaveBeenLastCalledWith(type, "new");
  }
  expect(grant).toHaveBeenCalledTimes(3);

  // A failing cleanup neither skips the other step nor hides the grant error.
  const remove = spy(Device, "delete", async () => {
    throw new Error("delete failed");
  });
  revoke.mockImplementation((async () => {
    throw new Error("revoke failed");
  }) as never);
  const res = await call("POST", "/devices", { name: "a", tuyaDeviceId: "t" });
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.json)).not.toContain("failed");
  expect(remove).toHaveBeenCalledWith("new");
  expect(revoke).toHaveBeenLastCalledWith("tuya_device", "new");
});
