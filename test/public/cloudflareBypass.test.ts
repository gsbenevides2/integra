import { ensureCloudflareBypass } from "@public/cloudflareBypass";

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

let fetchSpy: ReturnType<typeof spyOn>;
const paths = () => fetchSpy.mock.calls.map((c) => String(c[0]));
const answer = (check: Response | Error) =>
  fetchSpy.mockImplementation((async (input: unknown) => {
    if (String(input).endsWith("check-bypass")) {
      if (check instanceof Error) throw check;
      return check;
    }
    return Response.json({ ok: true });
  }) as never);

beforeEach(() => {
  fetchSpy = spyOn(globalThis, "fetch");
});
afterEach(() => fetchSpy.mockRestore());

test("turns the bypass on when it is off", async () => {
  answer(Response.json({ status: false }));
  await ensureCloudflareBypass();
  expect(paths()).toEqual(["/api/cloudflare/check-bypass", "/api/cloudflare/toogle-bypass"]);
  expect((fetchSpy.mock.calls[1]![1] as RequestInit).method).toBe("POST");
});

test("leaves an active bypass alone", async () => {
  answer(Response.json({ status: true }));
  await ensureCloudflareBypass();
  expect(paths()).toEqual(["/api/cloudflare/check-bypass"]);
});

test("ignores a failed check, whether HTTP or network", async () => {
  answer(new Response("x", { status: 500 }));
  await ensureCloudflareBypass();
  answer(new Error("offline"));
  await ensureCloudflareBypass();
  expect(paths().filter((p) => p.endsWith("toogle-bypass"))).toEqual([]);
});
