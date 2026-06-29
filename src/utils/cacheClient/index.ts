import type { RedisClient } from "bun";
import safeEnvGet from "utils/safeEnvGet";

export class CacheClient {
    private static redisClient = new Bun.RedisClient(safeEnvGet("REDIS_CACHE_URL"));

    static async get(key: RedisClient.KeyLike) {
        if (!this.redisClient.connected) await this.redisClient.connect();
        return this.redisClient.get(key);
    }
    static async set(key: RedisClient.KeyLike, value: RedisClient.KeyLike) {
        if (!this.redisClient.connected) await this.redisClient.connect();
        return this.redisClient.set(key, value);
    }
}
