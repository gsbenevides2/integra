import { authentikLoginFailed } from "scripts/authentik/loginFailed";
import sendBirthDayDiscordMessage from "scripts/birthday";
import { schedullerCalendarMessages } from "scripts/calendars";
import registerTriggers from "triggers";

await registerTriggers({
    triggers: [authentikLoginFailed, sendBirthDayDiscordMessage, schedullerCalendarMessages],
});
