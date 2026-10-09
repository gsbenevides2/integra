import safeEnvGet from "@server/safeEnvGet";

import { SpanKind, trace } from "@opentelemetry/api";

import { cacheRequests } from "../instrumentation/metrics";
import { withSpan } from "../instrumentation/withSpan";

const tracer = trace.getTracer("redis");

// Bun.redis gives up after maxRetries and never reconnects by itself: reconnect on demand.
async function withReconnect<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (Bun.redis.connected) throw err;
    await Bun.redis.connect();
    return op();
  }
}

export async function redisGet(key: string): Promise<string | null> {
  const serverAddress = new URL(safeEnvGet("REDIS_URL")).hostname;
  return withSpan(
    tracer,
    "redis.get",
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system.name": "redis",
        "db.operation.name": "GET",
        "db.redis.key": key,
        "server.address": serverAddress,
      },
    },
    async (span) => {
      const value = await withReconnect(() => Bun.redis.get(key));
      span.setAttribute("db.redis.value", value ?? "null");
      span.setAttribute("cache.hit", value !== null);
      cacheRequests.add(1, { result: value !== null ? "hit" : "miss" });
      return value;
    },
  );
}

export async function redisSet(key: string, value: string): Promise<void> {
  await withSpan(
    tracer,
    "redis.set",
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system.name": "redis",
        "db.operation.name": "SET",
        "db.redis.key": key,
        "db.redis.value": value,
      },
    },
    async () => {
      await withReconnect(() => Bun.redis.set(key, value));
    },
  );
}
