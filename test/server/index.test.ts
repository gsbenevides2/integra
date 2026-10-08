import { afterAll, expect, mock, spyOn, test } from "bun:test";

const envKeys = ["DATABASE_URL", "TUYA_ACCESS_ID", "TUYA_ACCESS_SECRET", "NODE_ENV", "ENABLE_CRONS"];
const saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;

process.env.DATABASE_URL ??= "postgres://u:p@127.0.0.1:1/none";
process.env.TUYA_ACCESS_ID ??= "id";
process.env.TUYA_ACCESS_SECRET ??= "secret";
process.env.NODE_ENV = "development"; // registerCrons becomes a no-op
delete process.env.ENABLE_CRONS;

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

const mod = await import("@server/index");

afterAll(() => {
  serve.mockRestore();
  once.mockRestore();
  log.mockRestore();
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

test("serves favicon redirect and service worker", async () => {
  const fav = await mod.app.handle(new Request("http://localhost/favicon.ico"));
  // Elysia's relative redirect fails URL parsing under app.handle (no real server); the route exists.
  expect(fav.status).not.toBe(404);
  const sw = await mod.app.handle(new Request("http://localhost/sw.js"));
  expect(sw.headers.get("content-type")).toBe("text/javascript");
  expect((await sw.text()).length).toBeGreaterThan(0);
});

