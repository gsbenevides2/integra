import "@server/modules/tplink/model";

import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test";

import { createFakeDb } from "../../../helpers/tplink-db";

const fake = createFakeDb();
let app: { handle: (r: Request) => Promise<Response> };
let Dev: any, Checks: any, Settings: any, job: typeof import("@server/modules/tplink/jobs/sync");
const seen: string[] = [];
const syncSettings = mock(async () => {});
const restartNetwork = mock(async () => {});
let realRouter: any;

beforeAll(async () => {
  mock.module("@server/db", () => ({ db: fake.db }));
  realRouter = { ...(await import("@server/modules/tplink/service/router")) };
  mock.module("@server/modules/tplink/service/router", () => ({ ...realRouter, syncSettings, restartNetwork }));
  ({ tplinkRoutes: app } = (await import("@server/modules/tplink/index")) as any);
  Dev = (await import("@server/modules/tplink/service/devices")).TpLinkDeviceService;
  Checks = (await import("@server/modules/tplink/service/checks")).TpLinkChecksService;
  Settings = (await import("@server/modules/tplink/service/settings")).TpLinkSettingsService;
  job = await import("@server/modules/tplink/jobs/sync");
  for (const [o, m] of [[Dev, "listDevices"], [Dev, "createDevice"], [Dev, "updateDevice"], [Dev, "deleteDevice"],
    [Dev, "createInterface"], [Dev, "updateInterface"], [Dev, "deleteInterface"], [Checks, "getDeviceHistory"],
    [Checks, "getLatestCheck"], [Settings, "getLatestRouterStatus"], [Settings, "getRouterStatusHistory"]] as const) {
    spyOn(o, m).mockImplementation((async (...a: unknown[]) => {
      seen.push(m + ":" + JSON.stringify(a));
      return { ok: m };
    }) as any);
  }
});
afterAll(() => {
  mock.restore();
  mock.module("@server/modules/tplink/service/router", () => realRouter);
});

const call = (method: string, path: string, body?: unknown) =>
  app.handle(new Request("http://localhost" + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));

test("device and interface routes delegate to services", async () => {
  const dev = { name: "n", brand: "b", type: "client" };
  const ifc = { name: "n", mac: "m", ip: "i" };
  expect((await call("GET", "/api/tplink/devices")).status).toBe(200);
  await call("POST", "/api/tplink/devices", dev);
  await call("PUT", "/api/tplink/devices/1", { name: "z" });
  await call("DELETE", "/api/tplink/devices/1");
  await call("POST", "/api/tplink/devices/1/interface", ifc);
  await call("PUT", "/api/tplink/devices/1/interface/2", { ip: "j" });
  await call("DELETE", "/api/tplink/devices/1/interface/2");
  await call("GET", "/api/tplink/devices/1/history?from=1&to=2");
  await call("GET", "/api/tplink/checks/latest");
  await call("GET", "/api/tplink/settings/latest-router-status");
  await call("GET", "/api/tplink/settings/router-status-history");
  await call("GET", "/api/tplink/settings/router-status-history?before=2026-01-01T00:00:00Z");
  expect(seen).toContain('getDeviceHistory:["1",{"from":1,"to":2}]');
  expect(seen).toContain('deleteInterface:["2"]');
  expect(seen).toContain('updateInterface:["1","2",{"ip":"j"}]');
  expect(seen.some((s) => s.startsWith("getRouterStatusHistory:[\"2026-01-01"))).toBe(true);
  expect(seen.some((s) => s === "getRouterStatusHistory:[null]")).toBe(true);
});

test("router sync / restart routes and job", async () => {
  expect(await (await call("POST", "/api/tplink/router/sync")).json()).toEqual({ ok: true });
  expect(await (await call("POST", "/api/tplink/router/restart-network")).json()).toEqual({ ok: true });
  await job.syncTpLinkData();
  expect(syncSettings).toHaveBeenCalledTimes(2);
  expect(restartNetwork).toHaveBeenCalledTimes(1);
});
