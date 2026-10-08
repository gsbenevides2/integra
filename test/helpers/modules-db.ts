/**
 * Chainable fake of the drizzle `db` object. Every method call returns the same
 * chain; awaiting a chain resolves with the next queued result (undefined when empty).
 */
export function makeFakeDb(results: unknown[] = []) {
  const queue = [...results];
  const calls: string[] = [];
  const makeChain = (): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            const value = queue.shift();
            if (value instanceof Error) {
              return (_res: unknown, rej: (e: unknown) => void) => rej(value);
            }
            return (res: (v: unknown) => void) => res(value);
          }
          if (prop === "as") {
            return () => ({
              platformId: 1,
              status: 1,
              problemDescription: 1,
              checkedAt: 1,
            });
          }
          return (...args: unknown[]) => {
            calls.push(`${String(prop)}`);
            void args;
            return makeChain();
          };
        },
      },
    );
  const db = makeChain() as Record<string, unknown>;
  return { db, queue, calls, push: (...r: unknown[]) => queue.push(...r) };
}
