import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { SQL } from "bun";

async function runTraced<T>(
  tracer: ReturnType<typeof trace.getTracer>,
  attributes: Record<string, string>,
  execute: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    "db.query",
    { kind: SpanKind.CLIENT, attributes },
    async (span) => {
      try {
        const result = await execute();
        span.setAttribute("db.response.body", JSON.stringify(result));
        span.setAttribute(
          "db.response.row_count",
          Array.isArray(result) ? result.length : 1,
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
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

/**
 * Bun's SQL.Query is lazy and thenable: Drizzle chains `.values()`/`.catch()`
 * on it *before* awaiting, and those chain methods return the same instance
 * (verified: `query.values() === query`). Overriding the instance's own
 * `.then` is therefore enough to intercept the real execution, however it's
 * chained, without breaking `.values()`/`.raw()`.
 */
function traceQuery<T>(
  tracer: ReturnType<typeof trace.getTracer>,
  serverAddress: string,
  statement: string,
  params: unknown[],
  query: SQL.Query<T>,
): SQL.Query<T> {
  const originalThen = query.then.bind(query);
  query.then = ((onFulfilled, onRejected) =>
    runTraced(
      tracer,
      {
        "db.system": "postgresql",
        "server.address": serverAddress,
        "db.statement": statement,
        "db.statement.params": JSON.stringify(params),
      },
      () => new Promise<T>((resolve, reject) => originalThen(resolve, reject)),
    ).then(onFulfilled, onRejected)) as SQL.Query<T>["then"];
  return query;
}

/** Wraps a Bun SQL client so every query records the executed statement and the rows it returned as an OTEL span, mirroring instrumentFetch.ts. */
export function instrumentDb(client: SQL, connectionUrl: string): SQL {
  const tracer = trace.getTracer("db");
  const serverAddress = new URL(connectionUrl).hostname;

  return new Proxy(client, {
    apply(target, _thisArg, args: [TemplateStringsArray, ...unknown[]]) {
      const [strings, ...values] = args;
      const query = Reflect.apply(
        target as unknown as (...a: unknown[]) => SQL.Query<unknown>,
        target,
        args,
      );
      return traceQuery(
        tracer,
        serverAddress,
        strings.join("?"),
        values,
        query,
      );
    },
    get(target, prop) {
      if (prop === "unsafe") {
        return (text: string, values?: unknown[] | Record<string, unknown>) =>
          traceQuery(
            tracer,
            serverAddress,
            text,
            Array.isArray(values) ? values : values ? [values] : [],
            target.unsafe(text, values as never),
          );
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as SQL;
}
