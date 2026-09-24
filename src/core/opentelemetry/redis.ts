/**
 * Redis operation tracing for Bun's built-in `redis` client.
 *
 * Wraps the most common Redis commands (get, set, del, exists, expire)
 * so each operation becomes a child span under the active trace context.
 */
import { type Span, type Tracer } from "@opentelemetry/api";
import {
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_STATEMENT,
} from "@opentelemetry/semantic-conventions";
import { getTracer } from "./tracer";

export type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | number | Buffer, options?: unknown): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

/**
 * Wrap a Bun Redis client instance so every operation creates
 * an OpenTelemetry span.
 */
export function instrumentRedis(client: RedisClient, tracer?: Tracer): RedisClient {
  const otel = tracer ?? getTracer();

  const COMMANDS = ["get", "set", "del", "exists", "expire", "hget", "hset", "hgetall", "hdel", "lpush", "rpush", "lpop", "rpop", "lrange", "sadd", "srem", "smembers", "zadd", "zrange", "zrem", "incr", "decr", "ping"];

  const handler: ProxyHandler<RedisClient> = {
    get(target, prop, receiver) {
      const key = String(prop);
      if (!COMMANDS.includes(key)) {
        return Reflect.get(target, prop, receiver);
      }

      return async (...args: unknown[]) => {
        const span = otel.startSpan(
          `redis.${key}`,
          {
            kind: 3, // CLIENT — internal
            attributes: {
              [SEMATTRS_DB_SYSTEM]: "redis",
              [SEMATTRS_DB_STATEMENT]: `${key} ${args.slice(0, 2).map((a) => String(a)).join(" ")}`,
            },
          },
        );

        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
          const result = await Reflect.get(target, prop, receiver)(...args);
          span.setStatus({ code: 1 });
          return result;
        } catch (err) {
          span.setStatus({ code: 2, message: String(err) });
          span.recordException(err instanceof Error ? err : new Error(String(err)));
          throw err;
        } finally {
          span.end();
        }
      };
    },
  };

  return new Proxy(client, handler);
}