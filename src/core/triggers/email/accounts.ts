import safeEnvGet from "utils/safeEnvGet";
import type { EmailAccountConfig } from "./types";

export const emailAccounts = {
    default: {
        user: safeEnvGet("EMAIL_DEFAULT_USER"),
        password: safeEnvGet("EMAIL_DEFAULT_PASSWORD"),
        host: safeEnvGet("EMAIL_DEFAULT_HOST"),
        port: Number(safeEnvGet("EMAIL_DEFAULT_PORT")),
        tls: safeEnvGet("EMAIL_DEFAULT_TLS") === "true",
    },
} satisfies Record<string, EmailAccountConfig>;