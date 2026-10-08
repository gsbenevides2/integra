import { afterAll, afterEach, beforeEach, describe, expect, mock, setSystemTime, spyOn, test } from "bun:test";

import { installDb, restoreDb } from "../../../../helpers/google-db";
installDb();

const real = {
  cache: { ...(await import("@server/shared/cache")) },
  discord: { ...(await import("@server/shared/discord")) },
  evolution: { ...(await import("@server/shared/evolution")) },
  ssh: { ...(await import("@server/shared/ssh")) },
  openrouter: { ...(await import("@server/modules/google/service/openrouter")) },
};

const store = new Map<string, string>();
const sent: string[] = [];
const written: { path: string; opts: unknown }[] = [];
let chatResponses: unknown[] = [];
const chatCalls: unknown[][] = [];

mock.module("@server/shared/cache", () => ({
  ...real.cache,
  redisGet: async (k: string) => store.get(k) ?? null,
  redisSet: async (k: string, v: string) => void store.set(k, v),
}));
mock.module("@server/shared/discord", () => ({ ...real.discord, sendDiscordMessage: async (m: string) => void sent.push(`d:${m}`) }));
mock.module("@server/shared/evolution", () => ({ ...real.evolution, sendEvolutionMessage: async (m: string) => void sent.push(`e:${m}`) }));
mock.module("@server/shared/ssh", () => ({
  ...real.ssh,
  writeSshFile: async (path: string, _b: Buffer, opts: unknown) => void written.push({ path, opts }),
}));
mock.module("@server/modules/google/service/openrouter", () => ({
  ...real.openrouter,
  chatJson: async (...args: unknown[]) => (chatCalls.push(args), chatResponses.shift()),
}));

const { GmailService } = await import("@server/modules/google/service/gmail");
const { CalendarService } = await import("@server/modules/google/service/calendar");
const { cleanAccessCodeEmails } = await import("@server/modules/google/jobs/accessCodeCleaner");
const { extractPayslips } = await import("@server/modules/google/jobs/payslipExtractor");
const { watchSupportTickets } = await import("@server/modules/google/jobs/supportTicketWatcher");
const { scheduleCalendarMessages, sendScheduledMessages } = await import("@server/modules/google/jobs/calendarReminders");

const spies: { mockRestore(): void }[] = [];
const spy = (o: any, m: string) => {
  const s = spyOn(o, m);
  spies.push(s);
  return s as any;
};
beforeEach(() => {
  store.clear();
  sent.length = 0;
  written.length = 0;
  chatCalls.length = 0;
  chatResponses = [];
});
afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
  setSystemTime();
});
afterAll(() => {
  restoreDb();
  mock.module("@server/shared/cache", () => real.cache);
  mock.module("@server/shared/discord", () => real.discord);
  mock.module("@server/shared/evolution", () => real.evolution);
  mock.module("@server/shared/ssh", () => real.ssh);
  mock.module("@server/modules/google/service/openrouter", () => real.openrouter);
});

describe("cleanAccessCodeEmails", () => {
  test("loops until a short page", async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `${i}` }));
    const search = spy(GmailService, "search");
    search.mockResolvedValueOnce(page(500)).mockResolvedValueOnce(page(3));
    const del = spy(GmailService, "batchDelete").mockResolvedValue(undefined);
    await cleanAccessCodeEmails();
    expect(del).toHaveBeenCalledTimes(2);
  });
  test("stops when empty", async () => {
    spy(GmailService, "search").mockResolvedValue([]);
    const del = spy(GmailService, "batchDelete");
    await cleanAccessCodeEmails();
    expect(del).not.toHaveBeenCalled();
  });
});

describe("extractPayslips", () => {
  const mail = { id: "m1", from: "", subject: "", isUnread: true };
  test("no emails / no label", async () => {
    const search = spy(GmailService, "search").mockResolvedValue([]);
    const find = spy(GmailService, "findLabelId").mockResolvedValue(null);
    await extractPayslips();
    expect(find).not.toHaveBeenCalled();
    search.mockResolvedValue([mail]);
    await extractPayslips();
    expect(find).toHaveBeenCalled();
    expect(written).toEqual([]);
  });
  test("classifies and stores every type", async () => {
    spy(GmailService, "search").mockResolvedValue([mail]);
    spy(GmailService, "findLabelId").mockResolvedValue("L");
    spy(GmailService, "listPdfAttachments").mockResolvedValue({ subject: "S", attachmentIds: ["a", "b", "c", "d"] });
    spy(GmailService, "getAttachment").mockResolvedValue(Buffer.from("pdf"));
    const label = spy(GmailService, "addLabel").mockResolvedValue(undefined);
    chatResponses = [
      { response: { type: "payslip", date: "09/2010" } },
      { response: { type: "payslip13", date: "11/2010", parcel: 2 } },
      { response: { type: "arduana", date: "2020" } },
      { response: { type: "none" } },
    ];
    await extractPayslips();
    expect(written.map((w) => w.path.split("Econverse/")[1])).toEqual([
      "Recibos de Salário/2010-09.PDF",
      "Recibos de Salário/2010-11-2-13.PDF",
      "Informes de Redimentos/Informe 2020.pdf",
    ]);
    expect(sent).toHaveLength(6);
    expect(label).toHaveBeenCalledWith(expect.any(String), "m1", "L");
  });
});

describe("watchSupportTickets", () => {
  test("no emails stores timestamp; with emails summarizes", async () => {
    const search = spy(GmailService, "search").mockResolvedValue([]);
    await watchSupportTickets();
    expect(store.get("google:gmail:support:after")).toBeDefined();
    expect(sent).toEqual([]);

    store.set("google:gmail:support:after", "123");
    search.mockResolvedValue([{ id: "1", from: "", subject: "", isUnread: true }]);
    spy(GmailService, "getFull").mockResolvedValue({ id: "1", from: "f", subject: "s", isUnread: true, body: "b" });
    chatResponses = [{ message: "hello" }];
    await watchSupportTickets();
    expect(search.mock.calls[1][1]).toContain("after:123");
    expect(chatCalls[0]![1]).toBe("Assunto: s\nConteúdo: b\nDe: f");
    expect(sent).toEqual(["d:hello", "e:hello"]);
  });
});

describe("calendar reminders", () => {
  const NOW = new Date("2026-03-10T12:00:00Z");
  const ev = (o: Record<string, unknown>) => ({
    id: "e", summary: "Meet", description: "", startDate: "2026-03-10T15:00:00Z", endDate: "",
    location: "", htmlLink: "", eventType: "default", attendees: [], conferenceUris: [], ...o,
  });
  const org = { email: "me@econverse.com.br", primary: true, summary: "", calendarId: "c1" };
  const setup = (events: Record<string, any[]>, cals = [org]) => {
    spy(CalendarService, "listCalendars").mockResolvedValue([...cals, ...cals]);
    spy(CalendarService, "listEvents").mockImplementation(async (c: any) => events[c.calendarId] ?? []);
  };
  const pending = () => JSON.parse(store.get("google:calendar:pending") ?? "[]");

  test("schedules full message with truncation, links and filters", async () => {
    setSystemTime(NOW);
    const other = { email: "x@gmail.com", primary: false, summary: "", calendarId: "c2" };
    setup(
      {
        c1: [
          ev({
            id: "full", description: "x".repeat(60), location: "Room",
            htmlLink: "https://calendar.google.com/e?a=1", conferenceUris: ["https://meet.google.com/abc"],
          }),
          ev({ id: "short", description: "short", htmlLink: "https://other.com/x", conferenceUris: ["https://zoom.us/j/1"] }),
          ev({ id: "plain" }),
          ev({ id: "past", startDate: "2026-03-10T10:00:00Z" }),
          ev({ id: "nonevent", eventType: "focusTime" }),
          ev({ id: "declined", attendees: [{ email: "guilherme.benevides@econverse.com.br", responseStatus: "declined" }] }),
          ev({ id: "accepted", attendees: [{ email: "guilherme.benevides@econverse.com.br", responseStatus: "accepted" }] }),
        ],
        c2: [ev({ id: "foreign" })],
      },
      [org, other] as any,
    );
    await scheduleCalendarMessages();
    const p = pending();
    expect(p.map((r: any) => r.eventId)).toEqual(["full", "short", "plain", "accepted"]);
    expect(p[0].triggerAt).toBe("2026-03-10T14:59:00.000Z");
    expect(p[0].message).toContain(`${"x".repeat(50)}...`);
    expect(p[0].message).toContain("Room");
    expect(p[0].message).toContain("authuser=me%40econverse.com.br");
    expect(p[0].message).toContain("12:00");
    expect(p[1].message).toContain("short");
    expect(p[1].message).not.toContain("authuser");
    expect(p[2].message).not.toContain("Link para");
  });
  test("holiday / vacation produce nothing", async () => {
    setSystemTime(NOW);
    setup({ c1: [ev({ description: "Feriado nacional", eventType: "birthday" }), ev({ id: "b" })] });
    await scheduleCalendarMessages();
    expect(pending()).toEqual([]);
    setup({ c1: [ev({ summary: "Férias", eventType: "outOfOffice" }), ev({ id: "b" })] });
    await scheduleCalendarMessages();
    expect(pending()).toEqual([]);
  });

  test("sendScheduledMessages", async () => {
    setSystemTime(NOW);
    await sendScheduledMessages();
    expect(sent).toEqual([]);
    const mk = (eventId: string, triggerAt: string) => ({ eventId, triggerAt, message: eventId });
    store.set("google:calendar:pending", JSON.stringify([mk("later", "2026-03-10T13:00:00Z")]));
    await sendScheduledMessages();
    expect(sent).toEqual([]);
    store.set("google:calendar:pending", JSON.stringify([mk("now", "2026-03-10T11:59:00Z"), mk("later", "2026-03-10T13:00:00Z")]));
    await sendScheduledMessages();
    expect(sent.sort()).toEqual(["d:now", "e:now"]);
    expect(pending().map((r: any) => r.eventId)).toEqual(["later"]);
  });
});
