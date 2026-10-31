import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";

import { installTestAuthz } from "../../../helpers/auth";
import { makeLine } from "./fixtures";

process.env.EMTU_BUSTIME_AUTH = "Basic test";
const restoreAuthz = await installTestAuthz();
const { nearbyBusRoutes } = await import("@server/modules/nearby-bus/index");
const emtu = await import("@server/modules/nearby-bus/service/emtu");
afterAll(() => restoreAuthz());

let fetchSpy: ReturnType<typeof spyOn>;
const respond = (handler: (url: string, init: RequestInit) => Response) => {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((u: unknown, i: RequestInit) =>
    Promise.resolve(handler(String(u), i))) as never);
};
afterEach(() => fetchSpy?.mockRestore());

describe("fetchPortalLine", () => {
  test("sends the credential, caches within the TTL and refetches after it", async () => {
    let headers: Headers | undefined;
    respond((_u, init) => {
      headers = new Headers(init.headers);
      return Response.json({ linhas: [{ codigo: "X1" }] });
    });
    expect(await emtu.fetchPortalLine("X1")).toEqual({ codigo: "X1" } as never);
    expect(headers?.get("authorization")).toBe("Basic test");
    await emtu.fetchPortalLine("X1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const realNow = Date.now;
    Date.now = () => realNow() + 60_000;
    try {
      await emtu.fetchPortalLine("X1");
    } finally {
      Date.now = realNow;
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test("returns null for unknown lines", async () => {
    respond(() => Response.json({ linhas: [] }));
    expect(await emtu.fetchPortalLine("X2")).toBeNull();
  });

  test("throws on HTTP errors and on the empty body sent without credentials", async () => {
    respond(() => new Response("no", { status: 500 }));
    await expect(emtu.fetchPortalLine("X3")).rejects.toThrow("500");
    fetchSpy.mockRestore();
    respond(() => new Response(""));
    await expect(emtu.fetchPortalLine("X4")).rejects.toThrow("empty body");
  });
});

describe("GET /api/nearby-bus", () => {
  const call = (q: string) => nearbyBusRoutes.handle(new Request(`http://localhost/api/nearby-bus${q}`));
  const portal = (url: string) =>
    Response.json({ linhas: url.endsWith("215") ? [] : [makeLine(Date.now(), { codigo: "NB" })] });

  test("returns the stops near the position, skipping lines the portal does not know", async () => {
    respond(portal);
    const res = await call("?lat=-23.62&lng=-46.3");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stops: { line: string; direction: string }[] };
    expect(body.stops.map((s) => `${s.line}/${s.direction}`)).toEqual(["NB/volta"]);
  });

  test("map-config exposes the Google Maps key, or null when unset", async () => {
    const get = async () => (await nearbyBusRoutes.handle(new Request("http://localhost/api/nearby-bus/map-config"))).json();
    delete process.env.GOOGLE_MAPS_API_KEY;
    expect(await get()).toEqual({ apiKey: null });
    process.env.GOOGLE_MAPS_API_KEY = "maps-key";
    expect(await get()).toEqual({ apiKey: "maps-key" });
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  test("validates the coordinates", async () => {
    respond(portal);
    expect((await call("?lat=abc&lng=-46.3")).status).toBe(422);
    expect((await call("?lat=-23.6")).status).toBe(422);
  });
});
