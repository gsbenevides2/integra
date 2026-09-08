import { authentikLoginFailed } from "extensions/scripts/authentik/loginFailed";
import { autoClean } from "extensions/scripts/auto-clean";
import sendBirthDayDiscordMessage from "extensions/scripts/birthday";
import { schedullerCalendarMessages } from "extensions/scripts/calendars";
import { gmailSuport } from "extensions/scripts/gmail/support";
import { sinalMonitor, sinalAPIMonitor } from "extensions/scripts/sinal";
import { statusSync } from "extensions/scripts/status-sync";
import { syncTpLinkData } from "extensions/scripts/tp-link-center";
import registerSettings from "core";
import { plataformStatusRoutes } from "extensions/scripts/plataform-status/routes";

await registerSettings({
    triggers: [
        authentikLoginFailed,
        sendBirthDayDiscordMessage,
        schedullerCalendarMessages,
        gmailSuport,
        statusSync,
        sinalMonitor,
        sinalAPIMonitor,
        syncTpLinkData,
        autoClean,
        plataformStatusRoutes,
    ],
});
