import { createRequire } from "node:module";

import { instrumentGaxios } from "@server/instrumentation/instrumentGaxios";

import { afterAll, beforeAll, expect, test } from "bun:test";
import { Gaxios } from "gaxios";

const cjs = createRequire(import.meta.url)("gaxios").Gaxios as typeof Gaxios;
const classes = [...new Set([Gaxios, cjs])];
const originals = classes.map((c) => c.prototype.request);

let impl: (opts: unknown) => Promise<unknown> = async () => ({});
const seen: unknown[] = [];

beforeAll(() => {
  for (const c of classes)
    c.prototype.request = (async (opts: unknown) => {
      seen.push(opts);
      return impl(opts);
    }) as never;
  instrumentGaxios();
  instrumentGaxios(); // idempotent
});
afterAll(() => {
  classes.forEach((c, i) => (c.prototype.request = originals[i]!));
});

const call = (opts?: unknown) =>
  (new Gaxios() as unknown as { request: (o?: unknown) => Promise<{ status: number }> }).request(opts);

test("success: headers (plain + Headers), JSON body, params", async () => {
  impl = async () => ({
    status: 200,
    ok: true,
    headers: new Headers({ "X-R": "1" }),
    data: { a: 1 },
  });
  const r = await call({
    url: "https://www.googleapis.com/x",
    method: "post",
    headers: { "X-A": "b" },
    params: { q: ["1", "2", null], z: "3" },
    data: { hello: "w" },
  });
  expect(r.status).toBe(200);
  const sent = seen.at(-1) as { url: string };
  expect(sent.url).toBe("https://www.googleapis.com/x");
});

test("defaults: no opts, bad url, non-ok result, plain-object headers", async () => {
  impl = async () => ({ status: 500, ok: false, headers: { "x-y": "z" }, data: "text" });
  expect((await call()).status).toBe(500);
  await call({ url: "not a url", headers: new Headers({ a: "b" }), body: "raw" });
  await call({ url: "https://h/x", headers: undefined });
});

test("body serialization skips non-JSON-able bodies", async () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const ok = { status: 200, ok: true, headers: {}, data: undefined };
  impl = async () => ok;
  for (const data of [
    "",
    null,
    42,
    new Uint8Array(1),
    new ArrayBuffer(1),
    new Blob(["x"]),
    { pipe: () => {} },
    new FormData(),
    new URLSearchParams("a=1"),
    circular,
  ])
    await call({ url: "https://h/", data });
});

test("errors: with response, without response", async () => {
  impl = async () => {
    throw Object.assign(new Error("http 404"), {
      response: { status: 404, headers: { a: "b" }, data: { err: 1 } },
    });
  };
  await expect(call({ url: "https://h/" })).rejects.toThrow("http 404");
  impl = async () => {
    throw new Error("socket");
  };
  await expect(call({ url: "https://h/" })).rejects.toThrow("socket");
});
