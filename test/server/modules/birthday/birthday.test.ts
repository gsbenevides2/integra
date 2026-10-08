import { buildBirthdayMessage } from "@server/modules/birthday/service/message";

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const discord = { ...(await import("@server/shared/discord")) };
const evolution = { ...(await import("@server/shared/evolution")) };
const auth = { ...(await import("@server/shared/authentik")) };
const sent: string[] = [];
const calls: unknown[] = [];
let toolText: string | undefined = "Maria (ID: abc1)\nJoao (ID: x2)";

mock.module("@server/shared/discord", () => ({ ...discord, sendDiscordMessage: async (m: string) => void sent.push(`d:${m}`) }));
mock.module("@server/shared/evolution", () => ({ ...evolution, sendEvolutionMessage: async (m: string) => void sent.push(`e:${m}`) }));
mock.module("@server/shared/authentik", () => ({ ...auth, loginInAuthentik: async (id: string) => (calls.push(id), { access_token: "tok" }) }));

const sdkClient = { ...(await import("@modelcontextprotocol/sdk/client/index.js")) };
const sdkTransport = { ...(await import("@modelcontextprotocol/sdk/client/streamableHttp.js")) };
mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  ...sdkClient,
  Client: class {
    async connect(t: unknown) { calls.push(t); }
    async callTool(a: unknown) { calls.push(a); return { content: toolText === undefined ? [] : [{ text: toolText }] }; }
  },
}));
mock.module("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  ...sdkTransport,
  StreamableHTTPClientTransport: class {
    constructor(public url: URL, public opts: unknown) {}
  },
}));

const env = { ...process.env };
beforeAll(() => {
  process.env.BIRTHDAY_SERVICE_CLIENT_ID = "cid";
  process.env.BIRTHDAY_SERVICE_ENDPOINT = "http://bd.local";
});
afterAll(() => {
  process.env = env;
  mock.module("@server/shared/discord", () => discord);
  mock.module("@server/shared/evolution", () => evolution);
  mock.module("@server/shared/authentik", () => auth);
  mock.module("@modelcontextprotocol/sdk/client/index.js", () => sdkClient);
  mock.module("@modelcontextprotocol/sdk/client/streamableHttp.js", () => sdkTransport);
});

describe("buildBirthdayMessage", () => {
  test("none", () => {
    expect(buildBirthdayMessage("Nenhum evento de aniversário encontrado")).toContain("não temos aniversariantes");
  });
  test("names", () => {
    const m = buildBirthdayMessage("Header\nMaria (ID: abc1)\nJoao (ID: x2)");
    expect(m).toContain("Maria\n🎈 Joao");
    expect(m).not.toContain("ID:");
  });
});

describe("events + job", () => {
  test("getEventsOfToday and sendBirthdayMessage", async () => {
    const { getEventsOfToday } = await import("@server/modules/birthday/service/events");
    expect(await getEventsOfToday()).toBe(toolText as string);
    const t = calls.find((c) => c instanceof Object && "url" in (c as object)) as { url: URL };
    expect(t.url.toString()).toBe("http://bd.local/mcp");
    toolText = undefined;
    expect(await getEventsOfToday()).toBe("");
    toolText = "Ana (ID: q1)";
    const { sendBirthdayMessage } = await import("@server/modules/birthday/jobs/sendMessage");
    await sendBirthdayMessage();
    expect(sent.map((s) => s[0])).toEqual(["d", "e"]);
    expect(sent[0]).toContain("Ana");
  });
});
