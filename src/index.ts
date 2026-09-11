import { authentikLoginFailed } from "extensions/scripts/authentik/loginFailed";
import { autoClean } from "extensions/scripts/auto-clean";
import sendBirthDayDiscordMessage from "extensions/scripts/birthday";
import { schedullerCalendarMessages } from "extensions/scripts/calendars";
import { sendCalendarScheduledMessages } from "extensions/scripts/calendars/sendScheduledMessages";
import { gmailSuport } from "extensions/scripts/gmail/support";
import { sinalMonitor } from "extensions/scripts/sinal";
import {
    serverMetricsCollectCron,
    serverMetricsSpeedtestCron,
} from "extensions/scripts/server-metrics/cron";
import { serverMetricsRoutes } from "extensions/scripts/server-metrics/routes";
import { syncTpLinkData } from "extensions/scripts/tp-link-center/cron";
import { tpLinkCenterRoutes } from "extensions/scripts/tp-link-center/routes";
import registerSettings from "core";
import { platformStatusRoutes } from "extensions/scripts/platform-status/routes";
import { platformStatusCheckCron } from "extensions/scripts/platform-status/cron";
import { trainStatusRoutes } from "extensions/scripts/train-status/routes";
import { trainStatusCheckCron } from "extensions/scripts/train-status/cron";
import { executionLogsRoutes } from "extensions/scripts/execution-logs/routes";
import { googleAccountsRoutes } from "extensions/scripts/google-accounts/routes";

await registerSettings({
    triggers: [
        authentikLoginFailed,
        sendBirthDayDiscordMessage,
        schedullerCalendarMessages,
        sendCalendarScheduledMessages,
        gmailSuport,
        serverMetricsCollectCron,
        serverMetricsSpeedtestCron,
        serverMetricsRoutes,
        sinalMonitor,
        syncTpLinkData,
        tpLinkCenterRoutes,
        autoClean,
        platformStatusRoutes,
        platformStatusCheckCron,
        trainStatusRoutes,
        trainStatusCheckCron,
        executionLogsRoutes,
        googleAccountsRoutes,
    ],
});
