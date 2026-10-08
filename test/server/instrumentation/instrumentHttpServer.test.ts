import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { Elysia } from "elysia";

const saved = {
  e: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  h: process.env.OTEL_EXPORTER_OTLP_HEADERS,
};
let elysiaOtel: typeof import("@server/instrumentation/instrumentHttpServer").elysiaOtel;
let app: Elysia;

beforeAll(async () => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:1";
  process.env.OTEL_EXPORTER_OTLP_HEADERS = "authorization=Bearer x";
  ({ elysiaOtel } = await import("@server/instrumentation/instrumentHttpServer"));
  app = new Elysia()
    .use(elysiaOtel)
    .get("/obj", ({ set }) => {
      set.headers["X-Custom"] = "1";
      return { a: 1 };
    })
    .get("/str", () => "text")
    .get("/res", () => new Response("raw"))
    .get("/none", () => undefined)
    .get("/boom", () => {
      throw new Error("kaboom");
    });
});
afterAll(() => {
  for (const [k, v] of [
    ["OTEL_EXPORTER_OTLP_ENDPOINT", saved.e],
    ["OTEL_EXPORTER_OTLP_HEADERS", saved.h],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
afterEach(() => (globalThis.fetch as { mockRestore?: () => void }).mockRestore?.());

const get = (p: string) => app.handle(new Request(`http://localhost${p}`));

test("routes respond for object, string, Response, empty bodies", async () => {
  expect(await (await get("/obj")).json()).toEqual({ a: 1 });
  expect(await (await get("/str")).text()).toBe("text");
  expect(await (await get("/res")).text()).toBe("raw");
  expect((await get("/none")).status).toBe(200);
});

test("errors still surface as 500", async () => {
  expect((await get("/boom")).status).toBe(500);
});

test("/v1/traces proxies to the collector and returns its status", async () => {
  const f = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
  const res = await app.handle(
    new Request("http://localhost/v1/traces", {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
    }),
  );
  expect(res.status).toBe(202);
  const [url, init] = f.mock.calls[0] as [string, { headers: Record<string, string> }];
  expect(url).toBe("http://127.0.0.1:1/v1/traces");
  expect(init.headers.authorization).toBe("Bearer x");
  expect(init.headers["content-type"]).toBe("application/x-protobuf");
});

test("/v1/traces returns 502 when collector is unreachable; keeps content-type", async () => {
  const f = spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
  const res = await app.handle(
    new Request("http://localhost/v1/traces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([1]),
    }),
  );
  expect(res.status).toBe(502);
  expect((f.mock.calls[0] as [string, { headers: Record<string, string> }])[1].headers["content-type"]).toBe("application/json");
});
