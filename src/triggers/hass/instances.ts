import safeEnvGet from "utils/safeEnvGet";
import type { InstancesSettings } from "./types";

export const instanceSettings = {
    default: {
        url: safeEnvGet("HA_DEFAULT_URL"),
        token: safeEnvGet("HA_DEFAULT_TOKEN"),
    },
} satisfies InstancesSettings;