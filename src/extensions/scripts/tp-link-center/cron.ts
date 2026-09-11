import onCron from "core/triggers/cron";
import { syncSettings } from "utils/tp-link-router/router";

export const syncTpLinkData = onCron(
    {
        cron: "0/2 * * * *", // every 2 minutes
        id: "sync-tp-link-data",
    },
    async (_, _traceId) => {
        await syncSettings();
    },
);
