import { afterAll, beforeAll, expect, test } from "bun:test";

const prev = process.env.DATABASE_URL;
beforeAll(() => {
  process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:1/none";
});
afterAll(() => {
  if (prev === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = prev;
});

test("db is a lazily-connecting drizzle instance", async () => {
  const { db } = await import("@server/db/index");
  expect(typeof db.select).toBe("function");
});

test("drizzle config reads DATABASE_URL", async () => {
  const cfg = (await import("@server/db/drizzle.config")).default as {
    dialect: string;
    dbCredentials: { url: string };
  };
  expect(cfg.dialect).toBe("postgresql");
  expect(cfg.dbCredentials.url).toBe("postgres://u:p@127.0.0.1:1/none");
});
