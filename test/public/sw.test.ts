import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test";

type Handler = (event: any) => void;
const handlers: Record<string, Handler> = {};
const g = globalThis as any;
const saved: Record<string, any> = {};

class FakeCache {
  store = new Map<string, any>();
  put = mock(async (req: any, res: any) => void this.store.set(req.url, res));
  match = mock(async (req: any) => this.store.get(req.url));
  keys = mock(async () => [...this.store.keys()].map((url) => ({ url })));
  delete = mock(async (req: any) => this.store.delete(req.url));
}
const caches = new Map<string, FakeCache>();
const cacheNames = ["old", "integra-shell-v1"];
const deleted: string[] = [];
const claim = mock(async () => {});
const skipWaiting = mock(async () => {});
const fetchMock = mock(async (_req: any): Promise<any> => ({ ok: true, clone() { return this; } }));

beforeAll(async () => {
  for (const k of ["caches", "clients", "skipWaiting", "registration", "fetch"]) saved[k] = g[k];
  g.caches = {
    open: async (name: string) => {
      if (!caches.has(name)) caches.set(name, new FakeCache());
      return caches.get(name)!;
    },
    keys: async () => cacheNames,
    delete: async (n: string) => void deleted.push(n),
  };
  g.clients = { claim };
  g.skipWaiting = skipWaiting;
  g.registration = { scope: "http://localhost:3000/" };
  g.fetch = fetchMock;
  const add = spyOn(globalThis, "addEventListener").mockImplementation(((t: string, h: Handler) => {
    handlers[t] = h;
  }) as any);
  await import("@public/sw");
  add.mockRestore();
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) g[k] = v;
});

function fire(req: any) {
  let responded: any;
  handlers.fetch({ request: req, respondWith: (p: any) => (responded = p) });
  return responded as Promise<any> | undefined;
}
const req = (url: string, extra: any = {}) => ({ method: "GET", url: `http://localhost:3000${url}`, mode: "cors", ...extra });

test("install skips waiting", () => {
  let p: any;
  handlers.install({ waitUntil: (x: any) => (p = x) });
  expect(skipWaiting).toHaveBeenCalled();
  return p;
});

test("activate drops foreign caches and claims", async () => {
  let p: any;
  handlers.activate({ waitUntil: (x: any) => (p = x) });
  await p;
  expect(deleted).toEqual(["old"]);
  expect(claim).toHaveBeenCalled();
});

test("ignores non-GET, cross-origin and other paths", () => {
  expect(fire(req("/api/x", { method: "POST" }))).toBeUndefined();
  expect(fire({ method: "GET", url: "http://evil.com/a", mode: "cors" })).toBeUndefined();
  expect(fire(req("/api/x"))).toBeUndefined();
});

test("navigation is network first, caches ok, falls back offline", async () => {
  const r = req("/", { mode: "navigate" });
  const res = await fire(r);
  expect(res.ok).toBe(true);
  expect(caches.get("integra-shell-v1")!.put).toHaveBeenCalled();

  fetchMock.mockImplementationOnce(async () => ({ ok: false, clone() { return this; } }));
  const bad = await fire(r);
  expect(bad.ok).toBe(false);

  fetchMock.mockImplementationOnce(async () => { throw new Error("offline"); });
  expect((await fire(r))).toBe(res); // cached copy
  fetchMock.mockImplementationOnce(async () => { throw new Error("offline"); });
  await expect(fire(req("/other", { mode: "navigate" }))).rejects.toThrow("offline");
});

test("assets: network on miss, cache hit with revalidation, drops other versions", async () => {
  const a1 = req("/assets/app.js?v=1");
  await fire(a1);
  const cache = caches.get("integra-assets-v1")!;
  expect(cache.store.has(a1.url)).toBe(true);

  const a2 = req("/assets/app.js?v=2");
  const cachedMiss = await fire(a2); // miss: waits for network
  expect(cachedMiss.ok).toBe(true);
  expect(cache.store.has(a1.url)).toBe(false); // old version dropped
  expect(cache.store.has(a2.url)).toBe(true);

  // another file with same query-less path stays untouched
  cache.store.set("http://localhost:3000/assets/other.js?v=1", {});

  // hit: served from cache; network failure swallowed; non-ok not cached
  const hit = await fire(a2);
  expect(hit.ok).toBe(true);
  fetchMock.mockImplementationOnce(async () => { throw new Error("offline"); });
  await fire(a2);
  fetchMock.mockImplementationOnce(async () => ({ ok: false, clone() { return this; } }));
  await fire(a2);
  await new Promise((r) => setTimeout(r, 5));
  expect(cache.store.has("http://localhost:3000/assets/other.js?v=1")).toBe(true);
});
