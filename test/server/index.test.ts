import { MANAGER_ROUTE_KEY } from "@server/modules/permissions/constants";

import { afterAll, expect, mock, spyOn, test } from "bun:test";

const envKeys = ["DATABASE_URL", "TUYA_ACCESS_ID", "TUYA_ACCESS_SECRET", "NODE_ENV", "ENABLE_CRONS", "USER_UID", "USER_NAME"];
const saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;

process.env.DATABASE_URL ??= "postgres://u:p@127.0.0.1:1/none";
process.env.TUYA_ACCESS_ID ??= "id";
process.env.TUYA_ACCESS_SECRET ??= "secret";
process.env.NODE_ENV = "development"; // registerCrons becomes a no-op
delete process.env.ENABLE_CRONS;
// Half-configured dev override: startup must warn about the missing USER_NAME.
process.env.USER_UID = "dev-uid";
delete process.env.USER_NAME;

// Stub every process-level side effect index.ts triggers on import.
const realGaxios = { ...(await import("@server/instrumentation/instrumentGaxios")) };
const realPulsar = { ...(await import("@server/modules/tuya/service/pulsar")) };
const gaxios = mock(() => {});
const pulsar = mock(() => {});
mock.module("@server/instrumentation/instrumentGaxios", () => ({ instrumentGaxios: gaxios }));
mock.module("@server/modules/tuya/service/pulsar", () => ({ ...realPulsar, startTuyaPulsar: pulsar }));

const stop = mock(() => {});
const serve = spyOn(Bun, "serve").mockImplementation((() => ({
  hostname: "localhost",
  port: 3000,
  stop,
})) as never);
const once = spyOn(process, "once").mockImplementation((() => process) as never);
const log = spyOn(console, "log").mockImplementation(() => {});
const loggerMod = await import("@server/instrumentation/instrumentLogger");
const warn = spyOn(loggerMod, "logWarn").mockImplementation(() => {});

const mod = await import("@server/index");

afterAll(() => {
  serve.mockRestore();
  once.mockRestore();
  log.mockRestore();
  warn.mockRestore();
  globalThis.fetch = realFetch;
  mock.module("@server/instrumentation/instrumentGaxios", () => realGaxios);
  mock.module("@server/modules/tuya/service/pulsar", () => realPulsar);
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("startup wires instrumentation, server, pulsar and crons", () => {
  expect(gaxios).toHaveBeenCalledTimes(1);
  expect(pulsar).toHaveBeenCalledTimes(1);
  expect(serve).toHaveBeenCalledTimes(1);
  const opts = serve.mock.calls[0]![0] as { port: number; development: boolean };
  expect(opts.port).toBe(3000);
  expect(opts.development).toBe(true);
  expect(once).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
  expect(mod.server.port).toBe(3000);
});

test("startup warns about a half-configured dev identity override", () => {
  expect(warn).toHaveBeenCalledWith(
    expect.anything(),
    expect.stringContaining("USER_NAME is not set"),
  );
});

test("serves favicon redirect and service worker", async () => {
  const fav = await mod.app.handle(new Request("http://localhost/favicon.ico"));
  // Elysia's relative redirect fails URL parsing under app.handle (no real server); the route exists.
  expect(fav.status).not.toBe(404);
  const sw = await mod.app.handle(new Request("http://localhost/sw.js"));
  expect(sw.headers.get("content-type")).toBe("text/javascript");
  expect((await sw.text()).length).toBeGreaterThan(0);
});

test("guarded route registry has real metadata and the manager key", async () => {
  const { guardedRoutes, guardedRouteKeys } = await import(
    "@server/shared/authz"
  );
  const routes = guardedRoutes();
  expect(routes.length).toBeGreaterThan(0);
  for (const route of routes) {
    expect(route.tag.trim().length).toBeGreaterThan(0);
    expect(route.summary.trim().length).toBeGreaterThan(0);
    // The fallback summary is the route key; a real one never is.
    expect(route.summary).not.toBe(route.key);
  }
  const keys = guardedRouteKeys();
  expect(keys).toContain(MANAGER_ROUTE_KEY);
  expect(keys).toContain("GET /openapi");
  expect(keys).toContain("GET /openapi/json");
  expect(keys).not.toContain("GET /api/me");
  expect(keys).not.toContain("POST /v1/traces");
});

test("bootstrap SQL contains the manager route key", async () => {
  const sql = await Bun.file("server/db/sql/auth-bootstrap.sql").text();
  expect(sql).toContain(MANAGER_ROUTE_KEY);
});

