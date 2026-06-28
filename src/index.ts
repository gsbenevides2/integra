import { authentikLoginFailed } from "scripts/authentik/loginFailed";
import registerTriggers from "triggers";

await registerTriggers({
    triggers: [authentikLoginFailed],
});
