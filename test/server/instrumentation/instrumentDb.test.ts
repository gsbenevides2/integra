import { instrumentDb } from "@server/instrumentation/instrumentDb";

import { expect, test } from "bun:test";

function makeQuery(result: unknown, fail = false) {
  const q = {
    then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
      return (fail ? Promise.reject(result) : Promise.resolve(result)).then(ok, bad);
    },
  };
  return q;
}

function makeClient(result: unknown, fail = false) {
  const seen: unknown[][] = [];
  const client = Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => {
      seen.push(["tag", strings, vals]);
      return makeQuery(result, fail);
    },
    {
      unsafe: (text: string, values?: unknown) => {
        seen.push(["unsafe", text, values]);
        return makeQuery(result, fail);
      },
      close: function (this: unknown) {
        return this === client;
      },
      flag: 42,
    },
  );
  return { client, seen };
}

const tpl = (s: string[]) => Object.assign([...s], { raw: s }) as unknown as TemplateStringsArray;

test("tagged template query is traced and returns result", async () => {
  const { client } = makeClient([{ a: 1 }]);
  const db = instrumentDb(client as never, "postgres://u:p@host:5432/d") as never as typeof client;
  const rows = await (db as never as (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>)(
    tpl(["SELECT * FROM ", " WHERE id = "]),
    "t",
    1,
  );
  expect(rows).toEqual([{ a: 1 }]);
});

test("non-array result, table-less statement and quoted table", async () => {
  const { client } = makeClient({ ok: true });
  const db = instrumentDb(client as never, "postgres://h/d") as never as typeof client;
  expect(await db.unsafe("BEGIN")).toEqual({ ok: true });
  expect(await db.unsafe('insert into "public.t" values (1)', [1])).toEqual({ ok: true });
  expect(await db.unsafe("update x set a=$1", { a: 1 } as never)).toEqual({ ok: true });
  expect(await db.unsafe("")).toEqual({ ok: true }); // empty -> operation ""
});

test("errors are recorded and rethrown", async () => {
  const { client } = makeClient(new Error("db down"), true);
  const db = instrumentDb(client as never, "postgres://h/d") as never as typeof client;
  await expect((async () => await db.unsafe("SELECT 1"))()).rejects.toThrow("db down");
});

test("other properties pass through, functions bound to target", () => {
  const { client } = makeClient(1);
  const db = instrumentDb(client as never, "postgres://h/d") as never as typeof client;
  expect(db.flag).toBe(42);
  expect(db.close()).toBe(true);
});
