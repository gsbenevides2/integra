import { sendDiscordMessage } from "@server/shared/discord";

import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";

beforeAll(() => {
  process.env.DISCORD_DEFAULT_PUBLIC_KEY = "tok";
});
afterEach(() => (globalThis.fetch as { mockRestore?: () => void }).mockRestore?.());

test("posts message with bot auth", async () => {
  const f = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await sendDiscordMessage("hi");
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(url).toContain("/channels/1444824842225582252/messages");
  expect((init.headers as Record<string, string>).Authorization).toBe("Bot tok");
  expect(init.body).toBe(JSON.stringify({ content: "hi" }));
});

test("throws on non-ok", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
  await expect(sendDiscordMessage("x")).rejects.toThrow("Discord message failed: 500 nope");
});
