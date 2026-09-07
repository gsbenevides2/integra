import { clearOldTraces } from "core/instrumentation";
import onCron from "core/triggers/cron";

export const autoClean = onCron(
    {
        cron: "0 0 */5 * *", // Every day at midnight
        id: "auto-clean",
    },
    async () => {
        await clearOldTraces();
    },
);
