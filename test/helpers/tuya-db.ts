import { mock } from "bun:test";

/**
 * Fake drizzle `db`: every builder method returns the same chainable proxy and awaiting it
 * consumes the next queued result (an Error is thrown instead of returned).
 */
export const fakeDbResults: unknown[] = [];
export const fakeDbCalls: { method: string; args: unknown[] }[] = [];

const chain: unknown = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          const next = fakeDbResults.length > 0 ? fakeDbResults.shift() : [];
          if (next instanceof Error) reject(next);
          else resolve(next);
        };
      }
      return (...args: unknown[]) => {
        fakeDbCalls.push({ method: String(prop), args });
        return chain;
      };
    },
  },
);

export function resetFakeDb(): void {
  fakeDbResults.length = 0;
  fakeDbCalls.length = 0;
}

/** Registers the fake and returns a restore function for afterAll. */
export async function installFakeDb(): Promise<() => void> {
  process.env.DATABASE_URL ??= "postgres://localhost/none";
  const real = { ...(await import("@server/db").catch(() => ({}))) };
  mock.module("@server/db", () => ({ db: chain }));
  return () => {
    mock.module("@server/db", () => real);
  };
}
