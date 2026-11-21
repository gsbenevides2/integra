import { getLogger, logError, logInfo, logWarn } from "../instrumentation/instrumentLogger";
import { db } from "./index";
import * as schema from "./schema";

const log = getLogger("db.sync");

/**
 * Drizzle-kit's programmatic schema push, typed without importing the package:
 * it is a devDependency, loaded on demand at runtime (see `drizzle-kit` in the
 * `external` list of `scripts/build-web.ts`).
 */
export type PushSchema = typeof import("drizzle-kit/api-postgres").pushSchema;

/** Everything drizzle-kit uses from the database instance. */
export interface SchemaDatabase {
  execute(query: unknown): Promise<unknown>;
}

export interface DbSyncOutcome {
  /** Statements the sync applied to the database. */
  statements: number;
  /** What drizzle-kit wants a human to look at before anything is applied. */
  hints: string[];
}

/**
 * Brings the database up to `server/db/schema.ts` when the daemon starts — the
 * same schema-push `bun run db:sync` does, without the CLI and without generating
 * or committing anything: the schema files are the source of truth. Runs in
 * production, or in dev with `ENABLE_DB_SYNC=true` (the dev process talks to the
 * same database).
 *
 * Nothing is applied when drizzle-kit raises a hint: that is how a destructive
 * change (dropping a column with data in it) shows up, and a boot is not the
 * place to decide it — the operator runs `bun run db:sync`, which asks.
 * Anything that goes wrong is logged and swallowed: a schema one change behind
 * is better than a daemon that does not boot.
 */
export async function syncSchemaOnStartup(
  env: NodeJS.ProcessEnv = process.env,
  database: SchemaDatabase = db,
  push?: PushSchema,
): Promise<DbSyncOutcome | null> {
  if (env.NODE_ENV !== "production" && env.ENABLE_DB_SYNC !== "true") {
    logInfo(
      log,
      "Sync de schema desativado fora de produção (use ENABLE_DB_SYNC=true ou `bun run db:sync`).",
    );
    return null;
  }

  try {
    const pushSchema =
      push ?? (await import("drizzle-kit/api-postgres")).pushSchema;
    const { sqlStatements, hints, apply } = await pushSchema(
      schema,
      {
        // drizzle-kit reads the rows out of `execute(...).rows`, the shape the
        // driver used to hand back; Bun's returns them directly (it also only
        // ever touches `execute` on the instance).
        execute: async (query: unknown) => ({
          rows: await database.execute(query),
        }),
      } as Parameters<PushSchema>[1],
    );
    const raised = hints.map((hint) => hint.hint);
    if (raised.length > 0) {
      logWarn(
        log,
        "O schema precisa de atenção antes de sincronizar: rode `bun run db:sync`.",
        { hints: raised.join(" | ") },
      );
      return { statements: 0, hints: raised };
    }
    if (sqlStatements.length === 0) {
      logInfo(log, "Schema já sincronizado.");
      return { statements: 0, hints: [] };
    }
    await apply();
    logInfo(log, "Schema sincronizado.", { statements: sqlStatements.length });
    return { statements: sqlStatements.length, hints: [] };
  } catch (error) {
    logError(log, "Falha ao sincronizar o schema.", error);
    return null;
  }
}
