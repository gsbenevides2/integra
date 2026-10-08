import { historyQuery, SistemaStatusSchema } from "@server/modules/server-metrics/model";
import { runCloudflareSpeedtest } from "@server/modules/server-metrics/service/cloudflareSpeedtest";

import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import { makeFakeDb } from "../../../helpers/modules-db";

let fake = makeFakeDb();
mock.module("@server/db", () => ({ db: new Proxy({}, { get: (_t, p) => (fake.db as never)[p] }) }));

const sshPath = "@server/shared/ssh";
const realSsh = { ...(await import(sshPath)) };
let sshOut = "";
const sshCalls: string[] = [];
mock.module(sshPath, () => ({
  ...realSsh,
  runSshCommand: async (cmd: string) => {
    sshCalls.push(cmd);
    return { stdout: sshOut, stderr: "" };
  },
}));
afterAll(() => {
  mock.module(sshPath, () => realSsh);
});

const { ServerMetricsService } = await import("@server/modules/server-metrics/service/collect");
const { collectServerMetrics, collectSpeedtest } = await import("@server/modules/server-metrics/jobs/collect");
const { serverMetricsRoutes } = await import("@server/modules/server-metrics/index");

const status = {
  memoria: { total_mb: "1000", usada_mb: "400", livre_mb: "600" },
  discos: [
    { filesystem: "/dev/sda", total: "10,5G", usado: "5G", livre: "5.5G", uso_porcentagem: "50%", montado_em: "/" },
  ],
  rede: { rx_kbs: "10", tx_kbs: "20" },
};

let fetchSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  fake = makeFakeDb();
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() =>
    Promise.resolve(new Response(new Uint8Array(1000)))) as never);
});
afterEach(() => fetchSpy.mockRestore());

test("model", () => {
  expect(SistemaStatusSchema.safeParse(status).success).toBe(true);
  expect(SistemaStatusSchema.safeParse({ ...status, discos: [] }).success).toBe(false);
  expect(historyQuery.parse({}).before).toBeUndefined();
});

describe("cloudflare speedtest", () => {
  test("returns positive numbers (odd/even median paths covered by 5 samples)", async () => {
    const r = await runCloudflareSpeedtest();
    expect(r.downloadMbps).toBeGreaterThan(0);
    expect(r.uploadMbps).toBeGreaterThan(0);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchSpy).toHaveBeenCalledTimes(7);
  });
  test("latency from mocked clock", async () => {
    const t = [0, 1, 1, 3, 3, 6, 6, 10, 10, 15, 15, 16, 16, 20, 20, 21];
    const now = spyOn(performance, "now").mockImplementation(() => t.shift() ?? 100);
    const r = await runCloudflareSpeedtest();
    now.mockRestore();
    expect(r.latencyMs).toBe(3);
  });
});

describe("ServerMetricsService", () => {
  test("getServerStatus uses default and custom script path", async () => {
    sshOut = JSON.stringify(status);
    const prev = process.env.STATS_SCRIPT_PATH;
    delete process.env.STATS_SCRIPT_PATH;
    await ServerMetricsService.getServerStatus();
    process.env.STATS_SCRIPT_PATH = "/x/stats.sh";
    expect(await ServerMetricsService.getServerStatus()).toEqual(status);
    if (prev === undefined) delete process.env.STATS_SCRIPT_PATH;
    else process.env.STATS_SCRIPT_PATH = prev;
    expect(sshCalls.slice(-2)).toEqual(["/home/gsbenevides2/stats.sh", "/x/stats.sh"]);
  });

  test("collect + job insert", async () => {
    sshOut = JSON.stringify(status);
    await ServerMetricsService.collect();
    await collectServerMetrics();
    expect(fake.calls.filter((c) => c === "values")).toHaveLength(2);
  });

  test("collectSpeedtest + job insert", async () => {
    await ServerMetricsService.collectSpeedtest();
    await collectSpeedtest();
    expect(fake.calls.filter((c) => c === "values")).toHaveLength(2);
  });

  test("latest / speedtestLatest", async () => {
    fake.push([{ id: 1 }], [], [{ id: 2 }], []);
    expect(await ServerMetricsService.latest()).toEqual({ id: 1 } as never);
    expect(await ServerMetricsService.latest()).toBeNull();
    expect(await ServerMetricsService.speedtestLatest()).toEqual({ id: 2 } as never);
    expect(await ServerMetricsService.speedtestLatest()).toBeNull();
  });

  describe.each(["history", "speedtestHistory"] as const)("%s", (method) => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ collectedAt: new Date(Date.UTC(2026, 0, 1, 0, 300 - i)) }));
    test("has more", async () => {
      const r = rows(201);
      fake.push(r);
      const page = await ServerMetricsService[method](new Date());
      expect(page.hasMore).toBe(true);
      expect(page.snapshots).toHaveLength(200);
      expect(page.nextCursor).toBe(r[199]!.collectedAt.toISOString());
    });
    test("no more / empty, no cursor", async () => {
      fake.push(rows(2), []);
      expect((await ServerMetricsService[method]()).hasMore).toBe(false);
      expect((await ServerMetricsService[method]()).nextCursor).toBeNull();
    });
  });

  test("constructor", () => {
    expect(new (ServerMetricsService as never as new () => object)()).toBeObject();
  });
});

describe("routes", () => {
  const call = (p: string) => serverMetricsRoutes.handle(new Request(`http://localhost${p}`));
  test("latest and speedtest latest", async () => {
    fake.push([{ id: 1 }], [{ id: 2 }]);
    expect(await (await call("/api/server-metrics/latest")).json()).toEqual({ id: 1 });
    expect(await (await call("/api/server-metrics/speedtest/latest")).json()).toEqual({ id: 2 });
  });
  test("histories with and without before", async () => {
    fake.push([], [], [], []);
    for (const p of [
      "/api/server-metrics/history",
      "/api/server-metrics/history?before=2026-01-01T00:00:00Z",
      "/api/server-metrics/speedtest/history",
      "/api/server-metrics/speedtest/history?before=2026-01-01T00:00:00Z",
    ]) {
      expect((await (await call(p)).json()).hasMore).toBe(false);
    }
  });
});
