import safeEnvGet from "utils/safeEnvGet";
import type { PostgresConfig } from "./types";

export const postgresInstances = {
    default: {
        url: safeEnvGet("POSTGRES_DEFAULT_URL"),
    },
} satisfies Record<string, PostgresConfig>;
