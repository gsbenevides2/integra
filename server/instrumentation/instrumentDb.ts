import { SpanKind, trace } from "@opentelemetry/api";
import type { SQL } from "bun";

import { dbDuration } from "./metrics";
import { recordSpanError } from "./withSpan";

/** "SELECT * FROM users" -> { operation: "SELECT", table: "users" } */
function parseStatement(statement: string): {
  operation: string;
  table?: string;
} {
  const operation = statement.trimStart().split(/\s+/, 1)[0]?.toUpperCase() ?? "QUERY";
  const table = statement.match(
    /\b(?:from|into|update)\s+"?([\w.]+)"?/i,
  )?.[1];
  return { operation, table };
}

async function runTraced<T>(
  tracer: ReturnType<typeof trace.getTracer>,
  attributes: Record<string, string>,
  execute: () => Promise<T>,
): Promise<T> {
  const { operation, table } = parseStatement(attributes["db.query.text"]!);
  const start = performance.now();
  return tracer.startActiveSpan(
    table ? `${operation} ${table}` : operation,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        ...attributes,
        "db.operation.name": operation,
        ...(table ? { "db.collection.name": table } : {}),
      },
    },
    async (span) => {
      try {
        const result = await execute();
        span.setAttribute("db.response.body", JSON.stringify(result));
        span.setAttribute(
          "db.response.row_count",
          Array.isArray(result) ? result.length : 1,
        );
        return result;
      } catch (error) {
        recordSpanError(span, error);
        throw error;
      } finally {
        dbDuration.record(performance.now() - start, {
          "db.operation.name": operation,
          ...(table ? { "db.collection.name": table } : {}),
        });
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
        "db.system.name": "postgresql",
        "server.address": serverAddress,
        "db.query.text": statement,
        "db.query.parameters": JSON.stringify(params),
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
        return (text: string, values?: unknown[] | Record<string, unknown>) => {
          const params = Array.isArray(values) ? values : values ? [values] : [];
          const query = target.unsafe(text, values as never);
          return traceQuery(tracer, serverAddress, text, params, query);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as SQL;
}
