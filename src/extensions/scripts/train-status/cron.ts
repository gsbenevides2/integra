import onCron from "core/triggers/cron";
import { checkTrainLinesStatus } from "./checkStatus";

export const trainStatusCheckCron = onCron(
    {
        cron: "*/2 * * * *",
        id: "train-status-check",
    },
    async (_, traceId) => {
        await checkTrainLinesStatus(traceId);
    },
);
