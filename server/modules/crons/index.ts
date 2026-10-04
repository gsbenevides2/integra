import Elysia from "elysia";

import { jobRegistry } from "../../cron";

const SCHEDULE_LABELS: Record<string, string> = {
  "* * * * *": "A cada minuto",
  "*/1 * * * *": "A cada minuto",
  "*/2 * * * *": "A cada 2 min",
  "0/2 * * * *": "A cada 2 min",
  "*/5 * * * *": "A cada 5 min",
  "*/10 * * * *": "A cada 10 min",
  "*/30 * * * *": "A cada 30 min",
  "0 * * * *": "A cada hora",
  "0 4 * * *": "Diário 04:00",
  "0 9 * * *": "Diário 09:00",
  "0 12 * * *": "Diário 12:00",
  "0 0 * * *": "Diário 00:00",
};

export const cronsRoutes = new Elysia({
  prefix: "/api/crons",
  detail: { tags: ["Crons"] },
})
  .get(
    "/list",
    () => {
      const jobs = Array.from(jobRegistry.entries()).map(([name, info]) => ({
        name,
        label: info.label,
        schedule: info.schedule,
        scheduleLabel: SCHEDULE_LABELS[info.schedule] ?? info.schedule,
      }));
      return { ok: true, jobs };
    },
    {
      detail: {
        summary: "List crons",
        description: "Lists all registered cron jobs with their schedules.",
      },
    },
  )
  .post(
    "/run/:jobName",
    async ({ params }) => {
      const job = jobRegistry.get(params.jobName);
      if (!job) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Job '${params.jobName}' not found`,
          }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        );
      }

      const start = Date.now();
      await job.fn();
      const elapsed = Date.now() - start;

      return { ok: true, job: params.jobName, elapsed };
    },
    {
      detail: {
        summary: "Run cron",
        description:
          "Executes a registered cron job immediately and returns the elapsed time.",
      },
    },
  );
