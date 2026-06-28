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
}

export interface RegisterConfig {
    triggers: Trigger[];
}

export interface CliSettings {
    onlyRun: string[];
    debug: boolean;
}

function argv0Reader(): CliSettings {
    const paramters = process.argv.slice(2);
    const defaultSettings: CliSettings = {
        onlyRun: [],
        debug: false,
    };

    for (const parameter of paramters) {
        const [key, val] = parameter.replace("--", "").split("=");
        if (key === "only-run" && val) {
            defaultSettings.onlyRun = [...defaultSettings.onlyRun, val];
        }
        if (key === "debug") {
            defaultSettings.debug = true;
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

    console.log("Triggers registrados. Integra em Operação");
}
