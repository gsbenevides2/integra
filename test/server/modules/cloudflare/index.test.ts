import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import Elysia from "elysia";

import { installTestAuthz } from "../../../helpers/auth";

const restoreAuthz = installTestAuthz();

const realService = {
  ...(await import("@server/modules/cloudlflare/service/cloudflarerules")),
};
const checkIfIsValid = mock(async (_t: string) => true);
const createToken = mock(async () => "33333333-3333-4333-8333-333333333333");
const inativateToken = mock(async (_t: string) => {});
class FakeRules {
  static bypass_cookie = "cf_bypass_integra" as const;
  static checkIfIsValid = checkIfIsValid;
  static createToken = createToken;
  static inativateToken = inativateToken;
}
mock.module("@server/modules/cloudlflare/service/cloudflarerules", () => ({
  CloudflareRules: FakeRules,
}));
const { cloudflareRoutes: routes } = await import("@server/modules/cloudlflare");
afterAll(() => {
  restoreAuthz();
  mock.module("@server/modules/cloudlflare/service/cloudflarerules", () => realService);
});
// happy-dom's Response also drops `set-cookie`, so capture the cookie jar Elysia built instead.
type Jar = Record<string, { value?: string; maxAge?: number; httpOnly?: boolean; secure?: boolean }>;
let sentCookie: Jar | undefined;
const cloudflareRoutes = new Elysia()
  .onAfterHandle({ as: "global" }, ({ cookie }) => {
    sentCookie = cookie as Jar;
  })
  .use(routes);

const TOKEN = "11111111-1111-4111-8111-111111111111";

// happy-dom's Request drops the forbidden `cookie` header, so inject it on the instance.
const call = (method: string, path: string, cookie?: string) => {
  const req = new Request(`http://localhost/api/cloudflare${path}`, { method });
  if (cookie) {
    const value = `cf_bypass_integra=${cookie}`;
    const get = (k: string) => (k.toLowerCase() === "cookie" ? value : null);
    Object.defineProperty(req, "headers", {
      value: {
        get,
        has: (k: string) => get(k) !== null,
        entries: () => [["cookie", value]][Symbol.iterator](),
        forEach: (f: (v: string, k: string) => void) => f(value, "cookie"),
      },
    });
  }
  return cloudflareRoutes.handle(req);
};

beforeEach(() => {
  checkIfIsValid.mockClear().mockImplementation(async () => true);
  createToken.mockClear();
  inativateToken.mockClear();
  delete process.env.USE_DEV_HTTP_SERVER;
  sentCookie = undefined;
});

test("check-bypass without cookie is false and skips the lookup", async () => {
  const res = await call("GET", "/check-bypass");
  expect(await res.json()).toEqual({ status: false });
  expect(checkIfIsValid).not.toHaveBeenCalled();
});

test("check-bypass reports token validity", async () => {
  expect(await (await call("GET", "/check-bypass", TOKEN)).json()).toEqual({ status: true });
  checkIfIsValid.mockImplementation(async () => false);
  expect(await (await call("GET", "/check-bypass", TOKEN)).json()).toEqual({ status: false });
  expect(checkIfIsValid).toHaveBeenCalledWith(TOKEN);
});

test("check-bypass rejects a non-uuid cookie", async () => {
  expect((await call("GET", "/check-bypass", "nope")).status).toBe(422);
});

test("toogle-bypass without cookie creates a secure httpOnly 30-day cookie", async () => {
  const res = await call("POST", "/toogle-bypass");
  expect(await res.json()).toEqual({ ok: true });
  expect(createToken).toHaveBeenCalledTimes(1);
  expect(sentCookie!.cf_bypass_integra).toMatchObject({
    value: "33333333-3333-4333-8333-333333333333",
    maxAge: 2592000,
    httpOnly: true,
    secure: true,
  });
});

test("toogle-bypass in dev HTTP mode drops Secure", async () => {
  process.env.USE_DEV_HTTP_SERVER = "true";
  await call("POST", "/toogle-bypass");
  expect(sentCookie!.cf_bypass_integra!.secure).toBe(false);
});

test("toogle-bypass with a valid cookie deactivates it and clears the cookie", async () => {
  await call("POST", "/toogle-bypass", TOKEN);
  expect(inativateToken).toHaveBeenCalledWith(TOKEN);
  expect(createToken).not.toHaveBeenCalled();
  expect(sentCookie!.cf_bypass_integra!.value).toBe("");
});

test("toogle-bypass with a stale cookie creates a new token", async () => {
  checkIfIsValid.mockImplementation(async () => false);
  await call("POST", "/toogle-bypass", TOKEN);
  expect(inativateToken).not.toHaveBeenCalled();
  expect(createToken).toHaveBeenCalledTimes(1);
});
