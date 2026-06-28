import { authentikLoginFailed } from "scripts/authentik/loginFailed";
import sendBirthDayDiscordMessage from "scripts/birthday";
import registerTriggers from "triggers";

await registerTriggers({
    triggers: [authentikLoginFailed, sendBirthDayDiscordMessage],
});
