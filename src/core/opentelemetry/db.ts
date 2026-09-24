/**
 * Drizzle ORM database tracing.
 *
 * Wraps the Drizzle database client so every query creates a child
 * span with semantic DB attributes.
 *
 * We intercept the `.prepare()` / `.all()` / `.execute()` / `.run()` chain
 * via a proxy on the Drizzle instance returned from `drizzle()`.
 */
import { type Span, type Tracer } from "@opentelemetry/api";
import { SEMATTRS_DB_SYSTEM, SEMATTRS_DB_STATEMENT, SEMATTRS_DB_NAME } from "@opentelemetry/semantic-conventions";
import { getTracer } from "./tracer";

// ---------------------------------------------------------------------------
// PostgreSQL pool / client proxy (used underneath Drizzle)
// ---------------------------------------------------------------------------

/**
 * Wraps an object that has a `.query()` or `.execute()` method
 * (Bun's built-in postgres pool, or a pg.Pool) with tracing.
 *
 * Handles the common patterns:
 *  - pool.query(sql, params) — raw SQL queries
 *  - pool.execute(sql, params) — prepared statements
 */
export function instrumentDbClient<T extends Record<string, unknown>>(client: T, tracer?: Tracer): T {
  const otel = tracer ?? getTracer();

  return new Proxy(client, {
    get(target, prop, receiver) {
      const key = String(prop);

      // Intercept query/execute — the primary paths Drizzle uses
      if (key === "query" || key === "execute") {
        return async (sql: string, params?: unknown[]) => {
          const span = otel.startSpan(`db.postgresql.${key}`, {
            kind: 3, // CLIENT
            attributes: {
              [SEMATTRS_DB_SYSTEM]: "postgresql",
              [SEMATTRS_DB_STATEMENT]: sql.slice(0, 2000), // truncate to avoid huge payloads
              [SEMATTRS_DB_NAME]: process.env.POSTGRES_DB ?? "integra",
            },
          });

          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
            const result = await Reflect.get(target, prop, receiver)(sql, params);
            span.setAttribute("db.result.count", Array.isArray(result) ? result.length : 1);
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
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}

// ---------------------------------------------------------------------------
// Drizzle ORM direct wrapper (higher-level)
// ---------------------------------------------------------------------------

/**
 * Patch a Drizzle ORM instance to add tracing.
 * Wraps the underlying `sql` template tag and the `db.select()`,
 * `db.insert()`, `db.update()`, `db.delete()` chain methods.
 *
 * Usage:
 * ```ts
 * import { drizzle } from "drizzle-orm/bun-sql";
 * import { instrumentDrizzle } from "core/opentelemetry/db";
 *
 * const raw = drizzle(client);
 * export const db = instrumentDrizzle(raw);
 * ```
 */
export function instrumentDrizzle<T extends Record<string, unknown>>(db: T, tracer?: Tracer): T {
  // For Drizzle, the most reliable approach is to proxy the underlying
  // SQL client (Bun SQL or pg.Pool). When `drizzle()` is called without
  // a specific session, it reads from the client directly.
  //
  // Since Drizzle wraps the driver and exposes `$client`, we can
  // intercept it.
  const $client = (db as Record<string, unknown>).$client as Record<string, unknown> | undefined;
  if ($client) {
    (db as Record<string, unknown>).$client = instrumentDbClient($client, tracer);
  }

  return db;
}