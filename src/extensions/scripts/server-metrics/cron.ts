import onCron from "core/triggers/cron";
import { collectServerMetrics } from "./collect";

export const serverMetricsCollectCron = onCron(
    {
        cron: "*/2 * * * *",
        id: "server-metrics-collect",
    },
    async (_, traceId) => {
        await collectServerMetrics(traceId);
    },
);
