export interface RedisClientConfig {
    url: string;
}

export type RedisInstanceKey = keyof typeof import("./instances").redisInstanceSettings;