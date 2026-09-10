import { startHttpServer } from "core/triggers/http";
import { startMqttClients } from "core/triggers/mqtt";
import { startHaClients } from "core/triggers/hass";
import { startRedisClients } from "core/triggers/redis";
import { startEmailClients } from "core/triggers/email";
import { startPostgresClients } from "core/triggers/postgres";
import type { Trigger } from "core/triggers";

export interface RegisterConfig {
    triggers: Trigger[];
}

export interface CliSettings {
    onlyRun: string[];
    debug: boolean;
    test: string;
}

function argv0Reader(): CliSettings {
    const paramters = process.argv.slice(2);
    const defaultSettings: CliSettings = {
        onlyRun: [],
        debug: false,
        test: "",
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
            defaultSettings.debug = true;
            defaultSettings.test = val ?? "";
        }
    }

    return defaultSettings;
}

declare global {
    var retest: () => Promise<void>;
    var triggers: Trigger[];
}

const startClientsAndServers = () => {
    startHttpServer();
    startMqttClients();
    startHaClients();
    startRedisClients();
    startEmailClients();
    startPostgresClients();
};

export default async function registerSettings(config: RegisterConfig) {
    const settings = argv0Reader();

    if (settings.debug === false) {
        console.debug = () => {};
    }
    global.triggers = config.triggers;

    console.log("Registrando Triggers");

    if (settings.test) {
        const findedTrigger = config.triggers.find((trigger) => trigger.id === settings.test);
        if (!findedTrigger) {
            throw new Error("Trigger not found to test");
        }
        console.debug("Testing trigger: " + findedTrigger.id);
        await findedTrigger.register();
        startClientsAndServers();
        if ("test" in findedTrigger && !findedTrigger.test) {
            throw new Error("Trigger not has method test");
        }
        console.debug("Running test for trigger: " + findedTrigger.id);
        await findedTrigger.test!();
        console.debug("Test finished for trigger: " + findedTrigger.id);
        global.retest = async () => {
            console.debug("Running test for trigger: " + findedTrigger.id);
            await findedTrigger.test!();
            console.debug("Test finished for trigger: " + findedTrigger.id);
        };
    } else {
        for (const trigger of config.triggers) {
            if (settings.onlyRun.length && !settings.onlyRun.includes(trigger.id)) continue;
            console.debug("Registrando id: " + trigger.id);
            await trigger.register();
        }
        startClientsAndServers();
    }

    console.log("Triggers registrados. Integra em Operação");
}
