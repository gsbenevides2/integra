import { afterAll, expect, mock, spyOn, test } from "bun:test";

const prevEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  ENABLE_CRONS: process.env.ENABLE_CRONS,
};
process.env.DATABASE_URL ??= "postgres://u:p@127.0.0.1:1/none";
// tuya client reads these at import time
const prevTuya = [process.env.TUYA_ACCESS_ID, process.env.TUYA_ACCESS_SECRET];
process.env.TUYA_ACCESS_ID ??= "id";
process.env.TUYA_ACCESS_SECRET ??= "secret";

const mods = {
  "@server/modules/birthday/jobs/sendMessage": ["sendBirthdayMessage"],
  "@server/modules/google/jobs/accessCodeCleaner": ["cleanAccessCodeEmails"],
  "@server/modules/google/jobs/calendarReminders": ["scheduleCalendarMessages", "sendScheduledMessages"],
  "@server/modules/google/jobs/payslipExtractor": ["extractPayslips"],
  "@server/modules/google/jobs/supportTicketWatcher": ["watchSupportTickets"],
  "@server/modules/server-metrics/jobs/collect": ["collectServerMetrics", "collectSpeedtest"],
  "@server/modules/status-platform/jobs/checkStatus": ["checkPlatformsStatus"],
  "@server/modules/tplink/jobs/sync": ["syncTpLinkData"],
  "@server/modules/train-status/jobs/checkStatus": ["checkTrainLinesStatus"],
} as const;

// Snapshot the real modules so other test files still see real code afterwards.
const real: Record<string, Record<string, unknown>> = {};
for (const p of Object.keys(mods))
  real[p] = { ...(await import(p)) };

const fns = new Map<string, ReturnType<typeof mock>>();
for (const [p, names] of Object.entries(mods)) {
  const exportsObj: Record<string, unknown> = { ...real[p] };
  for (const n of names) {
    const f = mock(async () => {});
    fns.set(n, f);
    exportsObj[n] = f;
  }
  mock.module(p, () => exportsObj);
}
const { HistoryService } = await import("@server/modules/tuya/service/history");
const prune = spyOn(HistoryService, "pruneAll").mockResolvedValue(undefined as never);

const { jobRegistry, registerCrons } = await import("@server/cron.ts?isolated");

afterAll(() => {
  prune.mockRestore();
  for (const [k, v] of [["TUYA_ACCESS_ID", prevTuya[0]], ["TUYA_ACCESS_SECRET", prevTuya[1]]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const [p, r] of Object.entries(real)) mock.module(p, () => r);
  for (const [k, v] of Object.entries(prevEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("registry lists every job with label and schedule", () => {
  expect(jobRegistry.size).toBe(12);
  for (const e of jobRegistry.values()) {
    expect(e.label).toBeString();
    expect(e.schedule).toBeString();
  }
});

test("each registry entry runs its underlying job", async () => {
  for (const e of jobRegistry.values()) await e.fn();
  expect(prune).toHaveBeenCalledTimes(1);
  for (const f of fns.values()) expect(f).toHaveBeenCalledTimes(1);
});

test("a failing job is swallowed (recorded on span)", async () => {
  fns.get("syncTpLinkData")!.mockRejectedValueOnce(new Error("router down"));
  await expect(jobRegistry.get("tplink.sync")!.fn()).resolves.toBeUndefined();
});

test("registerCrons is a no-op in dev without ENABLE_CRONS", () => {
  const cron = spyOn(Bun, "cron").mockImplementation((() => {}) as never);
  const log = spyOn(console, "log").mockImplementation(() => {});
  process.env.NODE_ENV = "development";
  delete process.env.ENABLE_CRONS;
  registerCrons();
  expect(cron).not.toHaveBeenCalled();
  cron.mockRestore();
  log.mockRestore();
});

test("registerCrons schedules all jobs in production or when enabled", async () => {
  const cron = spyOn(Bun, "cron").mockImplementation((() => {}) as never);
  process.env.NODE_ENV = "production";
  registerCrons();
  expect(cron).toHaveBeenCalledTimes(12);
  process.env.NODE_ENV = "development";
  process.env.ENABLE_CRONS = "true";
  registerCrons();
  expect(cron).toHaveBeenCalledTimes(24);
  // the scheduled callback is the traced wrapper
  await (cron.mock.calls[0]![1] as () => Promise<void>)();
  cron.mockRestore();
});
