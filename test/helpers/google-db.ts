import { mock } from "bun:test";

// installDb() registers a fake `@server/db` (chainable, awaitable). Call restoreDb() in afterAll.
process.env.DATABASE_URL ??= "postgres://u:p@localhost:5432/d";
const real = { ...(await import("@server/db")) };

export const state: { result: unknown; ops: { op: string; args: unknown[] }[] } = { result: [], ops: [] };
const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === "then") return (res: (v: unknown) => void) => res(state.result);
      return (...args: unknown[]) => (state.ops.push({ op: prop, args }), chain);
    },
  },
);
export const installDb = () => mock.module("@server/db", () => ({ db: chain }));
export const restoreDb = () => mock.module("@server/db", () => real);
