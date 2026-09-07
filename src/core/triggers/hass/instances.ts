import safeEnvGet from "utils/safeEnvGet";
import type { InstancesSettings } from "./types";

export const instanceSettings = {
    default: {
        host: safeEnvGet("HA_DEFAULT_URL"),
        token: safeEnvGet("HA_DEFAULT_TOKEN"),
        useTLS: true,
    },
} satisfies InstancesSettings;
