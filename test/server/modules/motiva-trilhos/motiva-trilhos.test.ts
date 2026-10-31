import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";

import { installTestAuthz } from "../../../helpers/auth";

process.env.MOTIVA_API_KEY = "test-key";
const restoreAuthz = await installTestAuthz();
const { motivaTrilhosRoutes } = await import("@server/modules/motiva-trilhos/index");
const motiva = await import("@server/modules/motiva-trilhos/service/motiva");
afterAll(() => restoreAuthz());

let fetchSpy: ReturnType<typeof spyOn>;
const respond = (handler: (url: string, init: RequestInit) => Response) => {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((u: unknown, i: RequestInit) =>
    Promise.resolve(handler(String(u), i))) as never);
};
afterEach(() => fetchSpy?.mockRestore());

const entriesFor = (url: string) => {
  if (url.includes("/LUZ")) return [{ direction: "Vila Sônia Profa. Elisabeth Tenreiro", expectedArrivalTime: new Date(Date.now() + 3 * 60_000).toISOString() }];
  if (url.includes("/PIN")) return [{ direction: "Varginha", expectedArrivalTime: new Date(Date.now() + 2 * 60_000).toISOString() }];
  if (url.includes("/MRB")) return [{ direction: "Osasco", expectedArrivalTime: "" }];
  return []; // PIH: no matching direction in the fixture
};

describe("fetchNextTrain", () => {
  test("sends the key, caches within the TTL and refetches after it", async () => {
    let headers: Headers | undefined;
    respond((url, init) => {
      headers = new Headers(init.headers);
      return Response.json({ Data: [{ direction: "Vila Sônia Profa. Elisabeth Tenreiro", expectedArrivalTime: "" }] });
    });
    // A station not used by any COMMUTE_LEGS entry, so it doesn't share a cache key with the route test below.
    const leg = { concessionaire: "VQ" as const, track: "4" as const, station: "XYZ" };
    await motiva.fetchNextTrain(leg);
    expect(headers?.get("apim-api-key")).toBe("test-key");
    await motiva.fetchNextTrain(leg);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const realNow = Date.now;
    Date.now = () => realNow() + 60_000;
    try {
      await motiva.fetchNextTrain(leg);
    } finally {
      Date.now = realNow;
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test("throws on HTTP errors", async () => {
    respond(() => new Response("no", { status: 500 }));
    await expect(motiva.fetchNextTrain({ concessionaire: "VM" as const, track: "9" as const, station: "ZZZ" })).rejects.toThrow("500");
  });
});

describe("GET /api/motiva-trilhos", () => {
  test("returns an ETA per leg, undefined when the line has no matching direction or is closed", async () => {
    respond((url) => Response.json({ Data: entriesFor(url) }));
    const res = await motivaTrilhosRoutes.handle(new Request("http://localhost/api/motiva-trilhos"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { legs: { id: string; etaMin?: number }[] };
    expect(body.legs.map((l) => l.id)).toEqual(["luz-pinheiros", "pinheiros-morumbi", "morumbi-pinheiros", "pinheiros-luz"]);
    expect(body.legs[0]!.etaMin).toBeCloseTo(3, 0);
    expect(body.legs[1]!.etaMin).toBeCloseTo(2, 0);
    expect(body.legs[2]!.etaMin).toBeUndefined(); // "" expectedArrivalTime: line not operating
    expect(body.legs[3]!.etaMin).toBeUndefined(); // no entry matches this leg's direction
  });
});
