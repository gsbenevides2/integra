import safeEnvGet from "utils/safeEnvGet";
import type { RedisClientConfig } from "./types";

export const redisInstanceSettings = {
    default: {
        url: safeEnvGet("REDIS_DEFAULT_URL"),
    },
} satisfies Record<string, RedisClientConfig>;
