import { spyOn } from "bun:test";

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: any;
}

type Handler = (call: Call) => unknown;

/**
 * Routes eden's fetch calls by "METHOD /path". A handler returns JSON (200),
 * a Response, or throws nothing; unknown routes answer 500 so `error` is set.
 */
export function mockTuyaFetch(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (
    input: any,
    init?: any,
  ) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input), "http://localhost:3000");
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    const raw = init?.body ?? (req ? await req.text() : undefined);
    const call: Call = {
      method,
      path: url.pathname,
      query: url.searchParams,
      body: typeof raw === "string" && raw ? JSON.parse(raw) : undefined,
    };
    calls.push(call);
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return new Response("nope", { status: 500 });
    const result = await handler(call);
    return result instanceof Response ? result : Response.json(result);
  }) as any);
  return { calls, restore: () => spy.mockRestore() };
}

export const fail = () => new Response(JSON.stringify("err"), { status: 500, headers: { "content-type": "application/json" } });
