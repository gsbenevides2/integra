import { sendEvolutionMessage } from "@server/shared/evolution";

import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";

beforeAll(() => {
  process.env.EVOLUTION_ENDPOINT = "http://evo.local";
  process.env.EVOLUTION_API_KEY = "key";
  process.env.PERSONAL_WHATSAPP_NUMBER = "551100";
});
afterEach(() =>
  (globalThis.fetch as { mockRestore?: () => void }).mockRestore?.(),
);

const instances = (data: { token: string }[]) =>
  new Response(JSON.stringify({ data }));

test("fetches instance token then posts text to evolution", async () => {
  const f = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(instances([{ token: "inst-token" }]))
    .mockResolvedValueOnce(new Response("{}"));
  await sendEvolutionMessage("oi");

  const [tokenUrl, tokenInit] = f.mock.calls[0] as [string, RequestInit];
  expect(tokenUrl).toBe("http://evo.local/instance/all");
  expect(tokenInit.method).toBe("GET");
  expect((tokenInit.headers as Record<string, string>).apikey).toBe("key");

  const [url, init] = f.mock.calls[1] as [string, RequestInit];
  expect(url).toBe("http://evo.local/send/text");
  expect((init.headers as Record<string, string>).apikey).toBe("inst-token");
  expect(JSON.parse(init.body as string)).toEqual({
    number: "551100",
    text: "oi",
  });
});

test("throws when no instance token", async () => {
  const f = spyOn(globalThis, "fetch").mockResolvedValue(instances([]));
  await expect(sendEvolutionMessage("x")).rejects.toThrow("Missing Token");
  expect(f).toHaveBeenCalledTimes(1);
});

test("throws on non-ok", async () => {
  spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(instances([{ token: "t" }]))
    .mockResolvedValueOnce(new Response("bad", { status: 401 }));
  await expect(sendEvolutionMessage("x")).rejects.toThrow(
    "Evolution message failed: 401 bad",
  );
});
