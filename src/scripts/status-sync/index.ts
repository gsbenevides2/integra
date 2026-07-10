import onCron from "triggers/cron";
import { sendStatusUpdates, type StatusPlataform } from "utils/hass/plus/sendStatus";
import { sendTrainUpdates } from "utils/hass/plus/sendTrains";
import { getStatusOfPlataforms } from "utils/status/getStatus";
import { getTrainStatus } from "utils/train-status/getStatus";

export const statusSync = onCron(
    {
        cron: "*/5 * * * *",
        id: "status-sync",
    },
    async (_, traceId) => {
        const status = await getStatusOfPlataforms(traceId);
        const tansformatedStatus = status.map<StatusPlataform>((plataform) => ({
            hasProblem: plataform.status !== "OK",
            name: plataform.name,
            status_url: plataform.statusPage,
            problem_description: plataform.problemDescription,
        }));
        await sendStatusUpdates(tansformatedStatus, traceId);
        const trains = await getTrainStatus(traceId);
        await sendTrainUpdates(trains, traceId);
    },
);
