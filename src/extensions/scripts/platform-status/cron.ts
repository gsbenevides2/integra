import onCron from "core/triggers/cron";
import { checkPlatformsStatus } from "./checkStatus";

export const platformStatusCheckCron = onCron(
    {
        cron: "*/2 * * * *",
        id: "platform-status-check",
    },
    async (_, traceId) => {
        await checkPlatformsStatus(traceId);
    },
);
