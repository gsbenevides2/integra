import { afterAll, describe, expect, mock, test } from "bun:test";

mock.module("@server/db", () => ({ db: {} }));

const envKeys = ["TUYA_ACCESS_ID", "TUYA_ACCESS_SECRET", "DATABASE_URL"];
const prev = envKeys.map((k) => process.env[k]);
for (const k of envKeys) process.env[k] ??= "x";
afterAll(() => {
  envKeys.forEach((k, i) => {
    if (prev[i] === undefined) delete process.env[k];
    else process.env[k] = prev[i];
  });
});

const { jobRegistry } = await import("@server/cron");
const { cronsRoutes } = await import("@server/modules/crons/index");

const call = (path: string, init?: RequestInit) =>
  cronsRoutes.handle(new Request(`http://localhost${path}`, init));

describe("crons routes", () => {
  test("list maps schedules to labels, falling back to the raw expression", async () => {
    let ran = 0;
    jobRegistry.set("test.custom", { label: "Custom", schedule: "7 7 * * *", fn: async () => void ran++ });
    const body = (await (await call("/api/crons/list")).json()) as {
      ok: boolean;
      jobs: { name: string; scheduleLabel: string; schedule: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.jobs.find((j) => j.name === "test.custom")?.scheduleLabel).toBe("7 7 * * *");
    expect(body.jobs.find((j) => j.name === "trainStatus.check")?.scheduleLabel).toBe("A cada 2 min");

    const run = (await (await call("/api/crons/run/test.custom", { method: "POST" })).json()) as {
      ok: boolean;
      job: string;
      elapsed: number;
    };
    expect(run).toMatchObject({ ok: true, job: "test.custom" });
    expect(ran).toBe(1);
    jobRegistry.delete("test.custom");
  });

  test("run unknown job returns 404", async () => {
    const res = await call("/api/crons/run/nope", { method: "POST" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Job 'nope' not found" });
  });
});
