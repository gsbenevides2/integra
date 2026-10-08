import { spyOn } from "bun:test";

export const tuyaEnv = {
  TUYA_ACCESS_ID: "test-access-id",
  TUYA_ACCESS_SECRET: "0123456789abcdef0123456789abcdef",
  DATABASE_URL: "postgres://localhost/none",
};

export function setTuyaEnv(): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(tuyaEnv)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

export interface TuyaCall {
  path: string;
  method: string;
  body: unknown;
}

/**
 * Fakes the Tuya cloud behind `fetch`. `respond` returns the JSON envelope for each
 * non-token request; token requests are answered automatically.
 */
export function mockTuyaFetch(respond: (call: TuyaCall) => unknown) {
  const calls: TuyaCall[] = [];
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (
    input: unknown,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    const method = init?.method ?? "GET";
    let payload: unknown;
    if (url.pathname.startsWith("/v1.0/token")) {
      payload = {
        success: true,
        result: {
          access_token: "tok",
          refresh_token: "ref",
          expire_time: 7200,
          uid: "uid",
        },
        t: Date.now(),
      };
    } else {
      const call = {
        path,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      payload = respond(call);
    }
    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    });
  }) as never);
  return { calls, spy };
}
