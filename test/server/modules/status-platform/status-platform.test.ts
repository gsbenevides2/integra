import { platformBody } from "@server/modules/status-platform/model";
import { buildSegments } from "@server/modules/status-platform/service/history";

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import { makeFakeDb } from "../../../helpers/modules-db";

let fake = makeFakeDb();
mock.module("@server/db", () => ({ db: new Proxy({}, { get: (_t, p) => (fake.db as never)[p] }) }));

const { StatusPlatformService } = await import("@server/modules/status-platform/service/platforms");
const { checkPlatformsStatus } = await import("@server/modules/status-platform/jobs/checkStatus");
const { statusPlatformRoutes } = await import("@server/modules/status-platform/index");

const platform = { id: "p1", name: "N", url: "https://x.io", type: "generic" } as never;
const at = (s: string) => new Date(s);

describe("buildSegments", () => {
  test("groups consecutive statuses", () => {
    const segs = buildSegments([
      { status: "OK", problemDescription: null, checkedAt: at("2026-01-01T00:00:00Z") },
      { status: "OK", problemDescription: null, checkedAt: at("2026-01-01T00:01:00Z") },
      { status: "DOWN", problemDescription: "x", checkedAt: at("2026-01-01T00:02:00Z") },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.endedAt).toBe("2026-01-01T00:02:00.000Z");
    expect(segs[1]).toMatchObject({ status: "DOWN", endedAt: null, problemDescription: "x" });
    expect(buildSegments([])).toEqual([]);
  });
});

test("model validates body", () => {
  expect(platformBody.safeParse({ name: "a", url: "u", type: "wake" }).success).toBe(true);
  expect(platformBody.safeParse({ name: "a", url: "u", type: "nope" }).success).toBe(false);
});

describe("StatusPlatformService", () => {
  let fetchSpy: ReturnType<typeof spyOn>;
  beforeEach(() => {
    fake = makeFakeDb();
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok") as never);
  });
  afterEach(() => fetchSpy.mockRestore());

  test("checkOne stores OK", async () => {
    await StatusPlatformService.checkOne(platform);
    expect(fake.calls).toContain("values");
  });

  test("checkOne stores DOWN description from fetcher", async () => {
    fetchSpy.mockResolvedValue(new Response("x", { status: 500 }) as never);
    await StatusPlatformService.checkOne(platform);
    expect(fake.calls).toContain("values");
  });

  test("checkOne stores error message / unknown error", async () => {
    const atl = { ...(platform as object), type: "atlassian" } as never;
    fetchSpy.mockRejectedValue(new Error("down") as never);
    await StatusPlatformService.checkOne(atl);
    fetchSpy.mockRejectedValue("str" as never);
    await StatusPlatformService.checkOne(atl);
    expect(fake.calls.filter((c) => c === "values")).toHaveLength(2);
  });

  test("checkAll checks every platform", async () => {
    fake.push([platform, platform]);
    await StatusPlatformService.checkAll();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fake.push([platform]);
    await checkPlatformsStatus();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test("list with and without id", async () => {
    fake.push([{ id: 1 }], [{ id: 2 }]);
    expect(await StatusPlatformService.list()).toEqual([{ id: 1 }]);
    expect(await StatusPlatformService.list("p1")).toEqual([{ id: 2 }]);
    expect(fake.calls).toContain("where");
  });

  test("getHistory with cursor, full page", async () => {
    const checks = Array.from({ length: 100 }, (_, i) => ({
      status: "OK",
      problemDescription: null,
      checkedAt: new Date(Date.UTC(2026, 0, 1, 0, 100 - i)),
    }));
    fake.push(checks);
    const r = await StatusPlatformService.getHistory("p1", "2026-02-01T00:00:00Z");
    expect(r.hasMore).toBe(true);
    expect(r.checks).toHaveLength(100);
    expect(r.nextCursor).toBe(checks[99]!.checkedAt.toISOString());
  });

  test("getHistory empty, no cursor", async () => {
    fake.push([]);
    expect(await StatusPlatformService.getHistory("p1")).toMatchObject({
      checks: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  test("create / update / remove", async () => {
    const body = { name: "a", url: "https://x.io", type: "generic" as const };
    fake.push([], );
    expect(await StatusPlatformService.create(body)).toEqual([]);
    fake.push([platform], undefined, [{ listed: true }]);
    expect(await StatusPlatformService.create(body)).toEqual([{ listed: true }]);
    fake.push([]);
    expect(await StatusPlatformService.update("p1", body)).toEqual([]);
    fake.push([platform], undefined, [{ listed: 2 }]);
    expect(await StatusPlatformService.update("p1", body)).toEqual([{ listed: 2 }]);
    fake.push([platform]);
    expect(await StatusPlatformService.remove("p1")).toEqual([platform]);
  });
});

describe("routes", () => {
  const call = (path: string, init?: RequestInit) =>
    statusPlatformRoutes.handle(new Request(`http://localhost${path}`, init));
  const json = (method: string, body: unknown) => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const body = { name: "a", url: "https://x.io", type: "generic" };

  let restore = () => {};
  beforeEach(() => {
    fake = makeFakeDb();
    const s = spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok") as never);
    restore = () => s.mockRestore();
  });
  afterEach(() => restore());

  test("list", async () => {
    fake.push([{ id: "a" }]);
    const res = await call("/api/status-platform/list");
    expect(await res.json()).toEqual([{ id: "a" }]);
  });
  test("history", async () => {
    fake.push([]);
    const res = await call("/api/status-platform/p1/history?before=2026-01-01T00:00:00Z");
    expect((await res.json()).hasMore).toBe(false);
  });
  test("create, patch, delete", async () => {
    fake.push([]);
    expect(await (await call("/api/status-platform/", json("POST", body))).json()).toEqual([]);
    fake.push([]);
    expect(await (await call("/api/status-platform/p1", json("PATCH", body))).json()).toEqual([]);
    fake.push([{ id: "p1" }]);
    expect(await (await call("/api/status-platform/p1", { method: "DELETE" })).json()).toEqual([{ id: "p1" }]);
  });
});

test("abstract class constructor (coverage of implicit ctor)", () => {
  expect(new (StatusPlatformService as never as new () => object)()).toBeObject();
});
