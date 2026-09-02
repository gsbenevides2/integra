import { authentikLoginFailed } from "scripts/authentik/loginFailed";
import sendBirthDayDiscordMessage from "scripts/birthday";
import { schedullerCalendarMessages } from "scripts/calendars";
import { gmailSuport } from "scripts/gmail/support";
import { sinalMonitor, sinalAPIMonitor } from "scripts/sinal";
import { statusSync } from "scripts/status-sync";
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
    ],
});
