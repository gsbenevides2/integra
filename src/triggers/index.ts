import { startHttpServer } from "./http";
import { startMqttClients } from "./mqtt";
import { startHaClients } from "./hass";
import { startRedisClients } from "./redis";
import { startEmailClients } from "./email";
import { startPostgresClients } from "./postgres";

export interface TriggerSettings {
    id: string;
}

export interface Trigger {
    id: string;
    register: () => Promise<void>;
    test?: () => Promise<void>;
}

export interface RegisterConfig {
    triggers: Trigger[];
}

export interface CliSettings {
    onlyRun: string[];
    debug: boolean;
    test: string;
    stopBeforeTest: boolean;
}

function argv0Reader(): CliSettings {
    const paramters = process.argv.slice(2);
    const defaultSettings: CliSettings = {
        onlyRun: [],
        debug: false,
        test: "",
        stopBeforeTest: false,
    };

    for (const parameter of paramters) {
        const [key, val] = parameter.replace("--", "").split("=");
        if (key === "only-run" && val) {
            defaultSettings.onlyRun = [...defaultSettings.onlyRun, val];
        }
        if (key === "debug") {
            defaultSettings.debug = true;
        }
        if (key === "test") {
            defaultSettings.test = val ?? "";
        }
        if (key === "stopBeforeTest") {
            defaultSettings.stopBeforeTest = true;
        }
    }

    return defaultSettings;
}

export default async function registerTriggers(config: RegisterConfig) {
    const settings = argv0Reader();
    if (settings.debug === false) {
        console.debug = () => {};
    }

    console.log("Registrando Triggers");

    for (const trigger of config.triggers) {
        if (settings.onlyRun.length && !settings.onlyRun.includes(trigger.id)) continue;
        console.debug("Registrando id: " + trigger.id);
        await trigger.register();
    }

    startHttpServer();
    startMqttClients();
    startHaClients();
    startRedisClients();
    startEmailClients();
    startPostgresClients();

    if (settings.test) {
        const findedTrigger = config.triggers.find((trigger) => trigger.id === settings.test);
        if (!findedTrigger) {
            throw new Error("Trigger not found to test");
        } else if ("test" in findedTrigger && findedTrigger.test) {
            await findedTrigger.test();
            if (settings.stopBeforeTest) {
                process.exit(0);
            }
        } else {
            throw new Error("Trigger not has method test");
        }
    }

    console.log("Triggers registrados. Integra em Operação");
}
