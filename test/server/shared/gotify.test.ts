import { sendGotifyMessage } from "@server/shared/gotify";

import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";

beforeAll(() => {
  process.env.GOTIFY_URL = "http://gotify.local";
  process.env.GOTIFY_TOKEN = "tok";
});
afterEach(() => (globalThis.fetch as { mockRestore?: () => void }).mockRestore?.());

test("posts message with app token", async () => {
  const f = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await sendGotifyMessage("hi");
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("http://gotify.local/message");
  expect((init.headers as Record<string, string>)["X-Gotify-Key"]).toBe("tok");
  expect(JSON.parse(init.body as string)).toMatchObject({ message: "hi" });
});

test("throws on non-ok", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
  await expect(sendGotifyMessage("x")).rejects.toThrow("Gotify message failed: 500 nope");
});
