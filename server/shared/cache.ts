import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("shared");

export async function redisGet(key: string): Promise<string | null> {
  return tracer.startActiveSpan(
    "redis.get",
    {
      kind: SpanKind.CLIENT,
      attributes: { "db.system": "redis", "db.redis.key": key },
    },
    async (span) => {
      try {
        const value = await Bun.redis.get(key);
        span.setStatus({ code: SpanStatusCode.OK });
        return value;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export async function redisSet(key: string, value: string): Promise<void> {
  await tracer.startActiveSpan(
    "redis.set",
    {
      kind: SpanKind.CLIENT,
      attributes: { "db.system": "redis", "db.redis.key": key },
    },
    async (span) => {
      try {
        await Bun.redis.set(key, value);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
