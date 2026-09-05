import { clearOldTraces } from "instrumentation";
import onCron from "triggers/cron";

export const autoClean = onCron(
    {
        cron: "0 0 */5 * *", // Every day at midnight
        id: "auto-clean",
    },
    async () => {
        await clearOldTraces();
    },
);
