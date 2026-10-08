import * as schema from "@server/db/schema";

import { expect, test } from "bun:test";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

test("schema tables: default id factories, foreign keys and indexes resolve", () => {
  const tables = Object.values(schema).filter((v) => is(v, PgTable));
  expect(tables.length).toBeGreaterThan(10);
  for (const t of tables) {
    const cfg = getTableConfig(t);
    for (const col of cfg.columns) {
      if (col.defaultFn) expect(col.defaultFn()).toBeDefined();
    }
    for (const fk of cfg.foreignKeys) fk.reference(); // runs references() thunks
    expect(Array.isArray(cfg.indexes)).toBe(true); // extra-config thunk evaluated
  }
});
