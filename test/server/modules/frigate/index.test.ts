import { afterAll, beforeAll, beforeEach, expect, mock, spyOn, test } from "bun:test";

let app: { handle: (r: Request) => Promise<Response> };
let realAuth: any;
let fetchSpy: ReturnType<typeof spyOn>;
const env = { ...process.env };
const login = mock(async (_id: string) => ({ access_token: "TOK" }));

beforeAll(async () => {
  process.env.FRIGATE_CLIENT_ID = "cid";
  process.env.FRIGATE_ENDPOINT = "http://frigate.local/";
  realAuth = { ...(await import("@server/shared/authentik")) };
  mock.module("@server/shared/authentik", () => ({ ...realAuth, loginInAuthentik: login }));
  ({ frigateRoutes: app } = (await import("@server/modules/frigate/index")) as any);
});
afterAll(() => {
  mock.module("@server/shared/authentik", () => realAuth);
  process.env = env;
});
beforeEach(() => {
  fetchSpy?.mockRestore();
});

const get = (p: string) => app.handle(new Request("http://localhost" + p));

test("cameras lists enabled only, sends bearer", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ cameras: { a: {}, b: { enabled: false }, c: { enabled: true } } }),
  );
  const res = await get("/api/frigate/cameras");
  expect(await res.json()).toEqual(["a", "c"]);
  const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
  expect(String(url)).toBe("http://frigate.local/api/config");
  expect((init.headers as Headers).get("Authorization")).toBe("Bearer TOK");
});

test("cameras 502 when upstream fails", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 500 }));
  expect((await get("/api/frigate/cameras")).status).toBe(502);
});

test("stream proxies body and content-type", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("video", { headers: { "content-type": "video/mp4; codecs=x" } }),
  );
  const res = await get("/api/frigate/cameras/cam-1/stream");
  expect(res.headers.get("content-type")).toBe("video/mp4; codecs=x");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.text()).toBe("video");
  expect(String((fetchSpy.mock.calls[0] as any)[0])).toContain("stream.mp4?src=cam-1");
});

test("stream defaults content-type; fails with 502", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, body: new Response("v").body, headers: new Headers() } as any);
  expect((await get("/api/frigate/cameras/c/stream")).headers.get("content-type")).toBe("video/mp4");
  fetchSpy.mockRestore();
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 404 }));
  expect((await get("/api/frigate/cameras/c/stream")).status).toBe(502);
});

test("goToFrigate redirects; bad name rejected", async () => {
  const res = await get("/api/frigate/cameras/cam1/goToFrigate");
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe("http://frigate.local/#cam1");
  expect((await get("/api/frigate/cameras/b@d/goToFrigate")).status).toBe(422);
});
