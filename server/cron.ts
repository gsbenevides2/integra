import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

import { sendBirthdayMessage } from "./modules/birthday/jobs/sendMessage";
import {
  scheduleCalendarMessages,
  sendScheduledMessages,
} from "./modules/google/jobs/calendarReminders";
import { extractPayslips } from "./modules/google/jobs/payslipExtractor";
import { watchSupportTickets } from "./modules/google/jobs/supportTicketWatcher";
import {
  collectServerMetrics,
  collectSpeedtest,
} from "./modules/server-metrics/jobs/collect";
import { checkPlatformsStatus } from "./modules/status-platform/jobs/checkStatus";
import { syncTpLinkData } from "./modules/tplink/jobs/sync";
import { checkTrainLinesStatus } from "./modules/train-status/jobs/checkStatus";
import { HistoryService } from "./modules/tuya/service/history";

const tracer = trace.getTracer("cron");

/**
 * Guarantees every cron execution opens its own trace, regardless of whether the job
 * itself does any tracing — a single wrapping point instead of each job repeating the
 * try/catch/span boilerplate. A run's own error is recorded and swallowed here so one
 * failed execution (e.g. a flaky external dependency) doesn't take down the process.
 */
function tracedCronJob(name: string, fn: () => Promise<void>) {
  return async () => {
    await tracer.startActiveSpan(
      `cron.${name}`,
      { kind: SpanKind.INTERNAL },
      async (span) => {
        try {
          await fn();
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
        } finally {
          span.end();
        }
      },
    );
  };
}

export function registerCrons() {
  // Crons hit real hardware/APIs (routers, SSH boxes, Discord, Google, Tuya) — only
  // run them in production by default. Set ENABLE_CRONS=true to test one locally.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_CRONS !== "true"
  ) {
    console.log("Crons disabled in dev (set ENABLE_CRONS=true to enable).");
    return;
  }

  // Daily off-hours DB hygiene; device/sensor state itself arrives live via Tuya Pulsar.
  Bun.cron(
    "0 4 * * *",
    tracedCronJob("tuya.history.prune", () => HistoryService.pruneAll()),
  );
  Bun.cron(
    "*/10 * * * *",
    tracedCronJob("google.calendar.schedule", scheduleCalendarMessages),
  );
  Bun.cron(
    "* * * * *",
    tracedCronJob("google.calendar.send", sendScheduledMessages),
  );
  Bun.cron(
    "*/1 * * * *",
    tracedCronJob("google.gmail.support", watchSupportTickets),
  );
  Bun.cron(
    "0 12 * * *",
    tracedCronJob("google.gmail.payslip", extractPayslips),
  );
  Bun.cron(
    "*/2 * * * *",
    tracedCronJob("trainStatus.check", checkTrainLinesStatus),
  );
  Bun.cron(
    "*/5 * * * *",
    tracedCronJob("statusPlatform.check", checkPlatformsStatus),
  );
  Bun.cron(
    "*/2 * * * *",
    tracedCronJob("serverMetrics.collect", collectServerMetrics),
  );
  Bun.cron(
    "*/30 * * * *",
    tracedCronJob("serverMetrics.speedtest", collectSpeedtest),
  );
  Bun.cron("0/2 * * * *", tracedCronJob("tplink.sync", syncTpLinkData));
  Bun.cron("0 9 * * *", tracedCronJob("birthday.send", sendBirthdayMessage));
}
