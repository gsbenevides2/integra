// Fake drizzle `db`: every chain method returns the same thenable proxy; awaiting
// it consumes the next queued result (default []). Method calls are recorded.
export function createFakeDb() {
  const results: unknown[] = [];
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        const next = results.length ? results.shift() : [];
        return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          next instanceof Error ? rej(next) : res(next);
      }
      if (prop === "transaction") return (cb: (tx: unknown) => unknown) => cb(chain);
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return chain;
      };
    },
  });
  return {
    db: chain,
    calls,
    queue: (...r: unknown[]) => void results.push(...r),
    reset: () => {
      results.length = 0;
      calls.length = 0;
    },
  };
}
