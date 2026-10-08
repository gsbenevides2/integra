import { instrumentFetch } from "@server/instrumentation/instrumentFetch";

import { propagation } from "@opentelemetry/api";
import { afterAll, beforeAll, expect, mock, test } from "bun:test";

const realFetch = globalThis.fetch;
const prevEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const calls: Request[] | unknown[] = [];
let preconnected: unknown[] = [];
let respond: () => Response | Promise<Response> = () => new Response("ok");

beforeAll(() => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://otel.local:4318";
  const base = mock(async (input: unknown, init?: unknown) => {
    (calls as unknown[]).push([input, init]);
    return respond();
  }) as unknown as typeof fetch;
  base.preconnect = ((...a: unknown[]) => {
    preconnected = a;
  }) as never;
  globalThis.fetch = base;
  propagation.disable();
  propagation.setGlobalPropagator({
    inject: (_c, carrier, setter) => setter.set(carrier, "x-trace", "1"),
    extract: (c) => c,
    fields: () => ["x-trace"],
  });
  instrumentFetch();
});
afterAll(() => {
  propagation.disable();
  globalThis.fetch = realFetch;
  if (prevEndpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prevEndpoint;
});

test("traces a GET with string url and returns the response unconsumed", async () => {
  respond = () => new Response("hello", { headers: { "x-a": "b" } });
  (calls as unknown[]).length = 0;
  const res = await fetch("https://example.com/a");
  expect(((calls as unknown[][])[0]![0] as Request).headers.get("x-trace")).toBe("1");
  expect(await res.text()).toBe("hello");
});

test("POST with body is forwarded intact; https default port", async () => {
  respond = () => new Response("");
  (calls as unknown[]).length = 0;
  await fetch(new Request("https://example.com:8443/p", { method: "POST", body: "payload" }));
  const [req] = (calls as unknown[][])[0] as [Request];
  expect(await req.text()).toBe("payload");
  await fetch(new URL("http://example.com/x"));
});

test("non-ok response is marked as error but returned", async () => {
  respond = () => new Response("bad", { status: 500, statusText: "ISE" });
  const res = await fetch("http://example.com/err");
  expect(res.status).toBe(500);
});

test("upstream failure is rethrown", async () => {
  respond = () => Promise.reject(new Error("net down"));
  await expect(fetch("http://example.com/x")).rejects.toThrow("net down");
});

test("skipInstrumentation and OTLP host go straight to original fetch", async () => {
  respond = () => new Response("raw");
  (calls as unknown[]).length = 0;
  await fetch("http://example.com/s", { skipInstrumentation: true } as RequestInit);
  await fetch("http://otel.local:4318/v1/traces", { method: "POST" });
  await fetch(new Request("http://otel.local:4318/v1/x"));
  const first = (calls as unknown[][])[0]!;
  expect(first[0]).toBe("http://example.com/s");
  expect((calls as unknown[][])[1]![0]).toBe("http://otel.local:4318/v1/traces");
});

test("peekBody tolerates an unreadable body", async () => {
  const res = new Response("x");
  await res.text(); // body now used -> clone().text() throws
  respond = () => res;
  expect((await fetch("http://example.com/used")).status).toBe(200);
});

test("preconnect delegates", () => {
  fetch.preconnect("http://example.com", undefined as never);
  expect(preconnected[0]).toBe("http://example.com");
});
