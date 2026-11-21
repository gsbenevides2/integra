import type { PushSchema, SchemaDatabase } from "@server/db/sync";
import { syncSchemaOnStartup } from "@server/db/sync";

import { afterAll, expect, spyOn, test } from "bun:test";

const log = spyOn(console, "log").mockImplementation(() => {});
const warn = spyOn(console, "warn").mockImplementation(() => {});
const error = spyOn(console, "error").mockImplementation(() => {});
afterAll(() => {
  log.mockRestore();
  warn.mockRestore();
  error.mockRestore();
});

/** Stands in for drizzle-kit: reports the statements and hints it would apply. */
function plugin(
  plan: {
    statements?: string[];
    hints?: { hint: string; statement?: string }[];
    fail?: string;
  } = {},
) {
  const applied: string[] = [];
  const push = (async () => ({
    sqlStatements: plan.statements ?? [],
    hints: plan.hints ?? [],
    apply: async () => {
      if (plan.fail) throw new Error(plan.fail);
      applied.push("applied");
    },
  })) as unknown as PushSchema;
  return { push, applied };
}

/** The database is never touched: the plugin replaces drizzle-kit entirely. */
const database: SchemaDatabase = {
  execute: async () => [],
};

test("startup syncs the schema in production, and only then", async () => {
  const dev = plugin({ statements: ["ALTER TABLE t ADD COLUMN c int;"] });

  expect(
    await syncSchemaOnStartup({ NODE_ENV: "development" }, database, dev.push),
  ).toBeNull();
  expect(dev.applied).toEqual([]);
  expect(log).toHaveBeenCalledWith(
    expect.stringContaining("Sync de schema desativado fora de produção"),
    "",
  );

  const forced = plugin({ statements: ["ALTER TABLE t ADD COLUMN c int;"] });
  expect(
    await syncSchemaOnStartup(
      { NODE_ENV: "development", ENABLE_DB_SYNC: "true" },
      database,
      forced.push,
    ),
  ).toEqual({ statements: 1, hints: [] });
  expect(forced.applied).toEqual(["applied"]);
  expect(log).toHaveBeenCalledWith("Schema sincronizado.", { statements: 1 });
});

test("startup leaves a database that already matches alone", async () => {
  const upToDate = plugin();

  expect(
    await syncSchemaOnStartup(
      { NODE_ENV: "production" },
      database,
      upToDate.push,
    ),
  ).toEqual({ statements: 0, hints: [] });
  expect(upToDate.applied).toEqual([]);
  expect(log).toHaveBeenCalledWith("Schema já sincronizado.", "");
});

test("startup never decides a destructive change on its own", async () => {
  const destructive = plugin({
    statements: ['ALTER TABLE "tuya"."devices" DROP COLUMN "room";'],
    hints: [{ hint: "You are about to delete a column with data in it" }],
  });

  const outcome = await syncSchemaOnStartup(
    { NODE_ENV: "production" },
    database,
    destructive.push,
  );

  expect(outcome).toEqual({
    statements: 0,
    hints: ["You are about to delete a column with data in it"],
  });
  expect(destructive.applied).toEqual([]);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("rode `bun run db:sync`"),
    { hints: "You are about to delete a column with data in it" },
  );
});

test("startup logs a failure with anything that goes wrong", async () => {
  // drizzle-kit itself throwing (an unreachable database, an unsupported change).
  const broken = (async () => {
    throw new Error("sem banco");
  }) as unknown as PushSchema;
  expect(
    await syncSchemaOnStartup({ NODE_ENV: "production" }, database, broken),
  ).toBeNull();
  expect(error).toHaveBeenCalledWith(
    "Falha ao sincronizar o schema.",
    expect.objectContaining({ "error.message": "sem banco" }),
  );

  // And the statements themselves failing halfway through `apply()`.
  const failing = plugin({ statements: ["ALTER TABLE t ADD c int;"], fail: "DDL" });
  expect(
    await syncSchemaOnStartup({ NODE_ENV: "production" }, database, failing.push),
  ).toBeNull();
  expect(error).toHaveBeenCalledWith(
    "Falha ao sincronizar o schema.",
    expect.objectContaining({ "error.message": "DDL" }),
  );
});

test("drizzle-kit is loaded on demand when no plugin is injected", async () => {
  // The real package, against a database stand-in that cannot answer: the call
  // fails inside the module's own try/catch, which is what production relies on
  // when the schema cannot be introspected.
  expect(
    await syncSchemaOnStartup({ NODE_ENV: "production" }, {
      execute: () => {
        throw new Error("sem banco");
      },
    }),
  ).toBeNull();
  expect(error).toHaveBeenCalledWith(
    "Falha ao sincronizar o schema.",
    expect.anything(),
  );
});
