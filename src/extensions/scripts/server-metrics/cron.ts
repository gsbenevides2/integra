import onCron from "core/triggers/cron";
import { collectServerMetrics } from "./collect";
import { collectSpeedtest } from "./collectSpeedtest";

export const serverMetricsCollectCron = onCron(
    {
        cron: "*/2 * * * *",
        id: "server-metrics-collect",
    },
    async (_, traceId) => {
        await collectServerMetrics(traceId);
    },
);

export const serverMetricsSpeedtestCron = onCron(
    {
        cron: "*/30 * * * *",
        id: "server-metrics-speedtest",
    },
    async () => {
        await collectSpeedtest();
    },
);
