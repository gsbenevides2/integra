import { authentikLoginFailed } from "scripts/authentik/loginFailed";
import { autoClean } from "scripts/auto-clean";
import sendBirthDayDiscordMessage from "scripts/birthday";
import { schedullerCalendarMessages } from "scripts/calendars";
import { gmailSuport } from "scripts/gmail/support";
import { sinalMonitor, sinalAPIMonitor } from "scripts/sinal";
import { statusSync } from "scripts/status-sync";
import { syncTpLinkData } from "scripts/tp-link-center";
import registerTriggers from "triggers";

await registerTriggers({
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
    ],
});
