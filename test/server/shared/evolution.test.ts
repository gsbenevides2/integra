import { sendEvolutionMessage } from "@server/shared/evolution";

import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";

beforeAll(() => {
  process.env.EVOLUTION_ENDPOINT = "http://evo.local";
  process.env.EVOLUTION_API_KEY = "key";
  process.env.PERSONAL_WHATSAPP_NUMBER = "551100";
});
afterEach(() => (globalThis.fetch as { mockRestore?: () => void }).mockRestore?.());

test("posts text to evolution", async () => {
  const f = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await sendEvolutionMessage("oi");
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("http://evo.local/message/sendText/default");
  expect((init.headers as Record<string, string>).apikey).toBe("key");
  expect(JSON.parse(init.body as string)).toEqual({
    number: "551100",
    textMessage: { text: "oi" },
  });
});

test("throws on non-ok", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 401 }));
  await expect(sendEvolutionMessage("x")).rejects.toThrow("Evolution message failed: 401 bad");
});
