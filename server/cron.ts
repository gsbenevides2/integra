import { SpanKind, trace } from "@opentelemetry/api";

import { getLogger, logInfo } from "./instrumentation/instrumentLogger";
import { cronDuration, cronRuns } from "./instrumentation/metrics";
import { withSpan } from "./instrumentation/withSpan";
import { sendBirthdayMessage } from "./modules/birthday/jobs/sendMessage";
import { cleanAccessCodeEmails } from "./modules/google/jobs/accessCodeCleaner";
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
const log = getLogger("cron");

export interface CronJobEntry {
  label: string;
  schedule: string;
  fn: () => Promise<void>;
}

/**
 * Exported registry so the crons module can list available jobs and execute them
 * on demand. Populated unconditionally (even when crons are disabled in dev) so
 * the crons routes always have a complete view.
 */
export const jobRegistry = new Map<string, CronJobEntry>();

/**
 * Guarantees every cron execution opens its own trace, regardless of whether the job
 * itself does any tracing — a single wrapping point instead of each job repeating the
 * try/catch/span boilerplate. A run's own error is recorded and swallowed here so one
 * failed execution (e.g. a flaky external dependency) doesn't take down the process.
 */
function tracedCronJob(name: string, fn: () => Promise<void>) {
  return async () => {
    const start = performance.now();
    let outcome = "success";
    await withSpan(
      tracer,
      `cron.${name}`,
      { kind: SpanKind.INTERNAL, attributes: { "cron.job.name": name } },
      async () => {
        try {
          await fn();
        } catch (error) {
          outcome = "error";
          throw error;
        }
      },
    )
      .catch(() => {}) // recorded on the span; don't take down the process
      .finally(() => {
        const attrs = { "cron.job.name": name, outcome };
        cronRuns.add(1, attrs);
        cronDuration.record(performance.now() - start, attrs);
      });
  };
}

const jobDefinitions: Array<{
  name: string;
  label: string;
  schedule: string;
  fn: () => Promise<void>;
}> = [
  // Daily off-hours DB hygiene; device/sensor state itself arrives live via Tuya Pulsar.
  {
    name: "tuya.history.prune",
    label: "Podar histórico Tuya",
    schedule: "0 4 * * *",
    fn: () => HistoryService.pruneAll(),
  },
  {
    name: "google.calendar.schedule",
    label: "Agendar lembretes Google Calendar",
    schedule: "*/10 * * * *",
    fn: scheduleCalendarMessages,
  },
  {
    name: "google.calendar.send",
    label: "Enviar lembretes agendados",
    schedule: "* * * * *",
    fn: sendScheduledMessages,
  },
  {
    name: "google.gmail.support",
    label: "Verificar tickets de suporte",
    schedule: "*/1 * * * *",
    fn: watchSupportTickets,
  },
  {
    name: "google.gmail.accesscode",
    label: "Limpar e-mails de código de acesso",
    schedule: "0 0 * * *",
    fn: cleanAccessCodeEmails,
  },
  {
    name: "google.gmail.payslip",
    label: "Extrair holerites",
    schedule: "0 12 * * *",
    fn: extractPayslips,
  },
  {
    name: "trainStatus.check",
    label: "Verificar status de trens",
    schedule: "*/2 * * * *",
    fn: checkTrainLinesStatus,
  },
  {
    name: "statusPlatform.check",
    label: "Verificar status de plataformas",
    schedule: "*/5 * * * *",
    fn: checkPlatformsStatus,
  },
  {
    name: "serverMetrics.collect",
    label: "Coletar métricas do servidor",
    schedule: "*/2 * * * *",
    fn: collectServerMetrics,
  },
  {
    name: "serverMetrics.speedtest",
    label: "Teste de velocidade",
    schedule: "*/30 * * * *",
    fn: collectSpeedtest,
  },
  {
    name: "tplink.sync",
    label: "Sincronizar TP-Link",
    schedule: "0/2 * * * *",
    fn: syncTpLinkData,
  },
  {
    name: "birthday.send",
    label: "Enviar mensagem de aniversário",
    schedule: "0 9 * * *",
    fn: sendBirthdayMessage,
  },
];

/**
 * Populate the registry unconditionally so crons endpoints always have a complete view.
 */
for (const def of jobDefinitions) {
  jobRegistry.set(def.name, {
    label: def.label,
    schedule: def.schedule,
    fn: tracedCronJob(def.name, def.fn),
  });
}

export function registerCrons() {
  // Crons hit real hardware/APIs (routers, SSH boxes, Discord, Google, Tuya) — only
  // run them in production by default. Set ENABLE_CRONS=true to test one locally.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_CRONS !== "true"
  ) {
    logInfo(log, "Crons disabled in dev (set ENABLE_CRONS=true to enable).");
    return;
  }

  for (const def of jobDefinitions) {
    Bun.cron(def.schedule, tracedCronJob(def.name, def.fn));
  }
}
