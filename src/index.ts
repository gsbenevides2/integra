import { authentikLoginFailed } from "scripts/authentik/loginFailed";
import sendBirthDayDiscordMessage from "scripts/birthday";
import { schedullerCalendarMessages } from "scripts/calendars";
import { gmailSuport } from "scripts/gmail/support";
import registerTriggers from "triggers";

await registerTriggers({
    triggers: [
        authentikLoginFailed,
        sendBirthDayDiscordMessage,
        schedullerCalendarMessages,
        gmailSuport,
    ],
});
