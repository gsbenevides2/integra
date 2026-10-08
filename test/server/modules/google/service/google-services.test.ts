import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { afterAll } from "bun:test";
import { google } from "googleapis";

import { installDb, restoreDb } from "../../../../helpers/google-db";
installDb();
import { chatJson } from "@server/modules/google/service/openrouter";

const { GoogleAccountService } = await import("@server/modules/google/service/accounts");
const { CalendarService } = await import("@server/modules/google/service/calendar");
const { GmailService } = await import("@server/modules/google/service/gmail");
afterAll(restoreDb);

import { z } from "zod";

const auth = { fake: true } as any;
const spies: { mockRestore(): void }[] = [];
const track = <T extends { mockRestore(): void }>(s: T) => (spies.push(s), s);
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));
const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("CalendarService", () => {
  test("listCalendars", async () => {
    track(spyOn(GoogleAccountService, "getAllClients").mockResolvedValue([{ email: "a", authClient: auth }] as any));
    track(spyOn(google, "calendar").mockReturnValue({
      calendarList: { list: async () => ({ data: { items: [{ primary: true, summary: "S", id: "i" }, {}] } }) },
    } as any));
    expect(await CalendarService.listCalendars()).toEqual([
      { email: "a", primary: true, summary: "S", calendarId: "i" },
      { email: "a", primary: false, summary: "", calendarId: "" },
    ]);
    track(spyOn(google, "calendar").mockReturnValue({ calendarList: { list: async () => ({ data: {} }) } } as any));
    expect(await CalendarService.listCalendars()).toEqual([]);
  });
  test("listEvents formats full and empty events", async () => {
    track(spyOn(GoogleAccountService, "getClient").mockResolvedValue({ email: "a", authClient: auth }));
    const list = async () => ({
      data: {
        items: [
          {
            id: "1", summary: "s", description: "d", start: { dateTime: "S" }, end: { dateTime: "E" },
            location: "l", htmlLink: "h", eventType: "t",
            attendees: [{ email: "x", responseStatus: "accepted" }, {}],
            conferenceData: { entryPoints: [{ uri: "u" }, {}] },
          },
          {},
        ],
      },
    });
    track(spyOn(google, "calendar").mockReturnValue({ events: { list } } as any));
    const ev = await CalendarService.listEvents({ email: "a", primary: true, summary: "", calendarId: "c" }, "s", "e");
    expect(ev[0]).toMatchObject({ id: "1", startDate: "S", attendees: [{ email: "x", responseStatus: "accepted" }, { email: "", responseStatus: "needsAction" }], conferenceUris: ["u"] });
    expect(ev[1]).toMatchObject({ id: "", eventType: "default", attendees: [], conferenceUris: [] });
    track(spyOn(google, "calendar").mockReturnValue({ events: { list: async () => ({ data: {} }) } } as any));
    expect(await CalendarService.listEvents({ email: "a", primary: true, summary: "", calendarId: "c" }, "s", "e")).toEqual([]);
  });
});

describe("GmailService", () => {
  const setup = (users: any) => {
    track(spyOn(GoogleAccountService, "getClient").mockResolvedValue({ email: "a", authClient: auth }));
    track(spyOn(google, "gmail").mockReturnValue({ users } as any));
  };
  test("search", async () => {
    setup({
      messages: {
        list: async () => ({ data: { messages: [{ id: "1" }, {}] } }),
        get: async () => ({ data: { id: "1", labelIds: ["UNREAD"], payload: { headers: [{ name: "From", value: "f" }, { name: "Subject", value: "s" }] } } }),
      },
    });
    expect(await GmailService.search("a", "q")).toEqual([{ id: "1", from: "f", subject: "s", isUnread: true }]);
    setup({ messages: { list: async () => ({ data: {} }), get: async () => ({}) } });
    expect(await GmailService.search("a", "q", 1)).toEqual([]);
  });
  test("getFull body variants", async () => {
    const get = (data: any) => setup({ messages: { get: async () => ({ data }) } });
    get({ payload: { body: { data: b64("hi") } } });
    expect(await GmailService.getFull("a", "1")).toEqual({ id: "", from: "", subject: "", isUnread: false, body: "hi" });
    get({ payload: { parts: [{ mimeType: "image/png" }, { mimeType: "text/plain", body: { data: b64("part") } }] } });
    expect((await GmailService.getFull("a", "1")).body).toBe("part");
    get({ payload: { parts: [{ mimeType: "text/html", body: {} }] } });
    expect((await GmailService.getFull("a", "1")).body).toBe("");
    get({});
    expect((await GmailService.getFull("a", "1")).body).toBe("");
  });
  test("labels", async () => {
    const modify = async () => ({});
    setup({ labels: { list: async () => ({ data: { labels: [{ name: "x", id: "9" }] } }) }, messages: { modify } });
    expect(await GmailService.findLabelId("a", "x")).toBe("9");
    expect(await GmailService.findLabelId("a", "y")).toBeNull();
    setup({ labels: { list: async () => ({ data: {} }) }, messages: { modify } });
    expect(await GmailService.findLabelId("a", "y")).toBeNull();
    await GmailService.addLabel("a", "1", "L");
  });
  test("listPdfAttachments", async () => {
    setup({
      messages: {
        get: async () => ({
          data: {
            payload: {
              headers: [{ name: "Subject", value: "Sub" }],
              parts: [{ mimeType: "application/pdf", body: { attachmentId: "A" } }, { mimeType: "application/pdf", body: {} }, { mimeType: "text/plain" }],
            },
          },
        }),
      },
    });
    expect(await GmailService.listPdfAttachments("a", "1")).toEqual({ subject: "Sub", attachmentIds: ["A"] });
    setup({ messages: { get: async () => ({ data: {} }) } });
    expect(await GmailService.listPdfAttachments("a", "1")).toEqual({ subject: "Sem Assunto", attachmentIds: [] });
  });
  test("trash, batchDelete, getAttachment", async () => {
    const calls: string[] = [];
    let data: any = { data: Buffer.from("pdf").toString("base64url") };
    setup({
      messages: {
        trash: async () => void calls.push("trash"),
        batchDelete: async () => void calls.push("del"),
        attachments: { get: async () => ({ data }) },
      },
    });
    await GmailService.trash("a", "1");
    await GmailService.batchDelete("a", ["1"]);
    expect(calls).toEqual(["trash", "del"]);
    expect((await GmailService.getAttachment("a", "1", "A")).toString()).toBe("pdf");
    data = {};
    await expect(GmailService.getAttachment("a", "1", "A")).rejects.toThrow("no data");
  });
});

describe("chatJson", () => {
  const schema = z.object({ a: z.number() });
  const saved = process.env.OPEN_ROUTER_API_KEY;
  afterEach(() => {
    process.env.OPEN_ROUTER_API_KEY = saved;
  });
  test("success, http error, empty content", async () => {
    process.env.OPEN_ROUTER_API_KEY = "k";
    const f = track(spyOn(globalThis, "fetch") as any);
    f.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] })));
    expect(await chatJson("sys", "user", schema, "n")).toEqual({ a: 1 });
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer k");
    f.mockResolvedValue(new Response("bad", { status: 500 }));
    await expect(chatJson("s", "u", schema, "n")).rejects.toThrow("500 bad");
    f.mockResolvedValue(new Response(JSON.stringify({})));
    await expect(chatJson("s", "u", schema, "n")).rejects.toThrow("no content");
  });
});

test("abstract service classes are constructible at runtime (covers implicit ctors)", () => {
  for (const C of [CalendarService, GmailService, GoogleAccountService]) expect(new (C as any)()).toBeInstanceOf(C);
});
