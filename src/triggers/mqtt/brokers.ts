import safeEnvGet from "utils/safeEnvGet";
import type { BrokersSettings } from "./types";

export const brokerSettings = {
    default: {
        url: safeEnvGet("MQTT_DEFAULT_BROKER_URL"),
        username: safeEnvGet("MQTT_DEFAULT_BROKER_USERNAME"),
        password: safeEnvGet("MQTT_DEFAULT_BROKER_PASSWORD"),
    },
} satisfies BrokersSettings;
