import onCron from "core/triggers/cron";
import { reconcileDevices, runDiscovery } from "utils/tuya/sync";
import { syncCatalogue, syncSensorReadings } from "utils/tuya/sensorSync";

export const tuyaDiscoveryCron = onCron(
    {
        cron: "*/5 * * * *", // every 5 minutes
        id: "tuya-discovery",
    },
    async (_, traceId) => {
        await runDiscovery(traceId);
    },
);

export const tuyaSyncCron = onCron(
    {
        cron: "* * * * *", // every minute
        id: "tuya-sync",
    },
    async (_, traceId) => {
        await reconcileDevices(traceId);
    },
);

export const tuyaCatalogueCron = onCron(
    {
        cron: "7 */6 * * *", // four times a day, offset so it never lands with the readings sweep
        id: "tuya-catalogue",
    },
    async (_, traceId) => {
        await syncCatalogue(traceId);
    },
);

export const tuyaSensorReadingsCron = onCron(
    {
        // Every minute: a PIR holds its triggered state only briefly, so a slower sweep
        // would walk straight past a real detection.
        cron: "* * * * *",
        id: "tuya-sensor-readings",
    },
    async (_, traceId) => {
        await syncSensorReadings(traceId);
    },
);
