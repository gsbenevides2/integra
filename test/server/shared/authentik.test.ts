import { loginInAuthentik } from "@server/shared/authentik";

import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";

beforeAll(() => {
  process.env.AUTHENTIK_USERNAME = "u";
  process.env.AUTHENTIK_PASSWORD = "p";
  process.env.AUTHENTIK_URL = "http://auth.local";
});
afterEach(() => {
  (globalThis.fetch as { mockRestore?: () => void }).mockRestore?.();
  (Bun.redis.get as unknown as { mockRestore?: () => void }).mockRestore?.();
  (Bun.redis.set as unknown as { mockRestore?: () => void }).mockRestore?.();
});

const jwt = (exp: unknown) =>
  `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;

test("returns cached unexpired token without fetching", async () => {
  const t = jwt(Math.floor(Date.now() / 1000) + 1000);
  spyOn(Bun.redis, "get").mockResolvedValue(t);
  const f = spyOn(globalThis, "fetch");
  expect(await loginInAuthentik("c")).toEqual({ access_token: t });
  expect(f).not.toHaveBeenCalled();
});

for (const [name, cached] of [
  ["expired", jwt(1)],
  ["no exp", jwt("x")],
  ["no payload", "abc"],
  ["bad json", "h.bm90anNvbg.s"],
  ["miss", null],
] as const) {
  test(`logs in when cache is ${name}`, async () => {
    spyOn(Bun.redis, "get").mockResolvedValue(cached);
    const set = spyOn(Bun.redis, "set").mockResolvedValue("OK");
    const f = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ access_token: "new" }),
    );
    expect(await loginInAuthentik("c")).toEqual({ access_token: "new" });
    expect(f.mock.calls[0]![0]).toBe("http://auth.local/application/o/token/");
    expect(set).toHaveBeenCalledWith("authentik-login:c", "new");
  });
}

test("throws on failed login", async () => {
  spyOn(Bun.redis, "get").mockResolvedValue(null);
  spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("", { status: 401, statusText: "Unauthorized" }),
  );
  await expect(loginInAuthentik("c")).rejects.toThrow("Failed to get token: Unauthorized");
});
