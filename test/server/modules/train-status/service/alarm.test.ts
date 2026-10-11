import type {
  AlarmLine,
  AlarmLineState,
} from "@server/modules/train-status/service/alarm";

import {
  afterAll,
  afterEach,
  describe,
  expect,
  mock,
  setSystemTime,
  spyOn,
  test,
} from "bun:test";

process.env.DATABASE_URL ??= "postgres://u:p@127.0.0.1:1/none";

const realCache = { ...(await import("@server/shared/cache")) };
const realEvolution = { ...(await import("@server/shared/evolution")) };

const store = new Map<string, string>();
const sent: string[] = [];
let failSend = false;

mock.module("@server/shared/cache", () => ({
  ...realCache,
  redisGet: async (key: string) => store.get(key) ?? null,
  redisSet: async (key: string, value: string) => void store.set(key, value),
}));
mock.module("@server/shared/evolution", () => ({
  ...realEvolution,
  sendEvolutionMessage: async (message: string) => {
    if (failSend) throw new Error("evolution down");
    sent.push(message);
  },
}));

const { CalendarService } = await import(
  "@server/modules/google/service/calendar"
);
const { TrainStatusService } = await import(
  "@server/modules/train-status/service/checks"
);
const {
  ALARM_STATE_KEY,
  alarmWindowKey,
  buildAlarmMessage,
  getAlarmWindow,
  isAlarmDay,
  isHolidayEvent,
  isHolidayToday,
  resolveChange,
  runTrainStatusAlarm,
  saoPauloDayRange,
} = await import("@server/modules/train-status/service/alarm");
const { checkTrainLinesAlarm } = await import(
  "@server/modules/train-status/jobs/alarm"
);

// 2026-10-12 is a Monday; 2026-10-13 a Tuesday; 2026-10-11 a Sunday.
const MONDAY_MORNING = new Date("2026-10-12T10:00:00Z"); // 07:00 in São Paulo
const MONDAY_EVENING = new Date("2026-10-12T21:00:00Z"); // 18:00 in São Paulo

const spies: { mockRestore(): void }[] = [];
const spy = <T extends { mockRestore(): void }>(s: T): T => (spies.push(s), s);

const okLine = (code: number) => ({
  lineCode: code,
  lineColor: "x",
  situation: "Operação normal",
  status: "OK",
  description: null,
  checkedAt: new Date(),
});

const line = (
  code: number,
  status: string,
  situation = "Operação normal",
  description: string | null = null,
) => ({ ...okLine(code), status, situation, description });

const allOk = [okLine(2), okLine(4), okLine(9), okLine(10)];

const holidayEvent = (description: string) => ({
  id: "h",
  summary: "Feriado",
  description,
  startDate: "2026-10-12",
  endDate: "2026-10-13",
  location: "",
  htmlLink: "",
  eventType: "default",
  attendees: [],
  conferenceUris: [],
});

function setup(latest: unknown[], holidays: unknown[] = []) {
  spy(spyOn(TrainStatusService, "listLatest").mockResolvedValue(latest as never));
  spy(
    spyOn(CalendarService, "listHolidayEvents").mockResolvedValue(
      holidays as never,
    ),
  );
}

const alarmLine = (over: Partial<AlarmLine> = {}): AlarmLine => ({
  code: 2,
  color: "Verde",
  status: "OK",
  situation: "Operação normal",
  description: null,
  change: null,
  ...over,
});

afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
  setSystemTime();
  store.clear();
  sent.length = 0;
  failSend = false;
});

afterAll(() => {
  mock.module("@server/shared/cache", () => realCache);
  mock.module("@server/shared/evolution", () => realEvolution);
});

describe("gating helpers", () => {
  test("getAlarmWindow uses São Paulo time and exclusive ends", () => {
    expect(getAlarmWindow(new Date("2026-10-12T07:00:00Z"))).toBe("morning"); // 04:00
    expect(getAlarmWindow(new Date("2026-10-12T11:59:00Z"))).toBe("morning"); // 08:59
    expect(getAlarmWindow(new Date("2026-10-12T12:00:00Z"))).toBeNull(); // 09:00
    expect(getAlarmWindow(new Date("2026-10-12T06:59:00Z"))).toBeNull(); // 03:59
    expect(getAlarmWindow(new Date("2026-10-12T20:00:00Z"))).toBe("evening"); // 17:00
    expect(getAlarmWindow(new Date("2026-10-12T22:59:00Z"))).toBe("evening"); // 19:59
    expect(getAlarmWindow(new Date("2026-10-12T23:00:00Z"))).toBeNull(); // 20:00
    expect(getAlarmWindow(new Date("2026-10-12T19:59:00Z"))).toBeNull(); // 16:59
  });

  test("isAlarmDay allows Monday and Tuesday only", () => {
    expect(isAlarmDay(MONDAY_MORNING)).toBe(true);
    expect(isAlarmDay(new Date("2026-10-13T10:00:00Z"))).toBe(true);
    expect(isAlarmDay(new Date("2026-10-11T10:00:00Z"))).toBe(false);
    expect(isAlarmDay(new Date("2026-10-14T10:00:00Z"))).toBe(false);
  });

  test("alarmWindowKey and saoPauloDayRange", () => {
    expect(alarmWindowKey(MONDAY_MORNING, "morning")).toBe(
      "2026-10-12:morning",
    );
    expect(saoPauloDayRange(MONDAY_MORNING)).toEqual({
      start: "2026-10-12T00:00:00-03:00",
      end: "2026-10-13T00:00:00-03:00",
    });
  });

  test("isHolidayEvent skips national and SP regional only", () => {
    expect(isHolidayEvent(holidayEvent("Feriado público") as never)).toBe(true);
    expect(
      isHolidayEvent(holidayEvent("Feriado regional (São Paulo)") as never),
    ).toBe(true);
    expect(
      isHolidayEvent(holidayEvent("Feriado regional (Rio de Janeiro)") as never),
    ).toBe(false);
    expect(isHolidayEvent(holidayEvent("Observância") as never)).toBe(false);
    expect(isHolidayEvent(holidayEvent("") as never)).toBe(false);
  });

  test("isHolidayToday queries today's range and filters", async () => {
    const list = spy(
      spyOn(CalendarService, "listHolidayEvents").mockResolvedValue([
        holidayEvent("Feriado público"),
      ] as never),
    );
    expect(await isHolidayToday(MONDAY_MORNING)).toBe(true);
    expect(list).toHaveBeenCalledWith(
      "2026-10-12T00:00:00-03:00",
      "2026-10-13T00:00:00-03:00",
    );
    list.mockResolvedValue([] as never);
    expect(await isHolidayToday(MONDAY_MORNING)).toBe(false);
  });
});

describe("resolveChange", () => {
  const incident: AlarmLineState = {
    status: "WARNING",
    situation: "Reduzida",
    description: null,
  };
  const normal: AlarmLineState = {
    status: "OK",
    situation: "Operação normal",
    description: null,
  };

  test("new and changed incidents", () => {
    expect(resolveChange(incident, undefined)).toBe("incident");
    expect(resolveChange(incident, normal)).toBe("incident");
    expect(resolveChange(incident, incident)).toBeNull();
    expect(
      resolveChange(incident, { ...incident, situation: "outra" }),
    ).toBe("incident");
    expect(resolveChange(incident, { ...incident, description: "d" })).toBe(
      "incident",
    );
  });

  test("recoveries, including UNKNOWN", () => {
    expect(resolveChange(normal, incident)).toBe("recovery");
    expect(
      resolveChange({ ...normal, status: "UNKNOWN" }, incident),
    ).toBe("recovery");
    expect(resolveChange(normal, normal)).toBeNull();
    expect(resolveChange(normal, undefined)).toBeNull();
    expect(resolveChange({ ...normal, status: "CRITICAL" }, normal)).toBe(
      "incident",
    );
  });
});

describe("buildAlarmMessage", () => {
  test("incident tone lists the full picture", () => {
    const message = buildAlarmMessage([
      alarmLine({
        status: "CRITICAL",
        situation: "Paralisada",
        description: "trem parado",
        change: "incident",
      }),
      alarmLine({ code: 4, color: "Amarela" }),
      alarmLine({ code: 9, color: "Esmeralda" }),
      alarmLine({ code: 10, color: "Turquesa" }),
    ]);
    expect(message).toContain("detectou um probleminha");
    expect(message).toContain("**Linha 2 (Verde)** — CRITICAL");
    expect(message).toContain("Paralisada");
    expect(message).toContain("trem parado");
    expect(message).toContain("**Linha 10 (Turquesa)** — OK");
    expect(message).toContain("Ganbatte");
  });

  test("recovery tone when everything is back to normal", () => {
    const message = buildAlarmMessage([
      alarmLine({ status: "OK", change: "recovery" }),
      alarmLine({ code: 4, color: "Amarela", status: "UNKNOWN", situation: "" }),
      alarmLine({ code: 9, color: "Esmeralda" }),
      alarmLine({ code: 10, color: "Turquesa" }),
    ]);
    expect(message).toContain("tudo voltou ao normal");
    expect(message).toContain("Voltou ao normal");
    expect(message).toContain("Tudo tranquilo");
    expect(message).toContain("**Linha 4 (Amarela)** — UNKNOWN");
  });

  test("mixed tone keeps ongoing incidents visible", () => {
    const message = buildAlarmMessage([
      alarmLine({ status: "WARNING", situation: "Reduzida" }),
      alarmLine({ code: 4, color: "Amarela", change: "recovery" }),
      alarmLine({ code: 9, color: "Esmeralda" }),
      alarmLine({ code: 10, color: "Turquesa" }),
    ]);
    expect(message).toContain("Algumas linhas voltaram ao normal");
    expect(message).toContain("Ganbatte");
  });

  test("neutral tone when nothing changed", () => {
    const message = buildAlarmMessage([
      alarmLine(),
      alarmLine({ code: 4, color: "Amarela" }),
      alarmLine({ code: 9, color: "Esmeralda" }),
      alarmLine({ code: 10, color: "Turquesa" }),
    ]);
    expect(message).toContain("atualizar o status das linhas");
  });
});

describe("runTrainStatusAlarm", () => {
  test("skips outside the schedule without touching holidays or status", async () => {
    const holidays = spy(spyOn(CalendarService, "listHolidayEvents"));
    const latest = spy(spyOn(TrainStatusService, "listLatest"));
    await runTrainStatusAlarm(new Date("2026-10-11T10:00:00Z")); // Sunday
    await runTrainStatusAlarm(new Date("2026-10-14T10:00:00Z")); // Wednesday
    await runTrainStatusAlarm(new Date("2026-10-12T06:59:00Z")); // 03:59
    await runTrainStatusAlarm(new Date("2026-10-12T12:00:00Z")); // 09:00
    await runTrainStatusAlarm(new Date("2026-10-12T23:00:00Z")); // 20:00
    expect(holidays).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  test("sends nothing when every line is normal", async () => {
    setup(allOk);
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toEqual([]);
    expect(store.has(ALARM_STATE_KEY)).toBe(false);
  });

  test("skips holidays", async () => {
    setup([line(2, "CRITICAL", "Paralisada")], [holidayEvent("Feriado público")]);
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toEqual([]);
  });

  test("notifies a new incident once and stores the window state", async () => {
    setup([
      line(2, "CRITICAL", "Paralisada", "trem parado"),
      okLine(4),
      okLine(9),
      okLine(10),
    ]);
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("**Linha 2 (Verde)** — CRITICAL");
    expect(sent[0]).toContain("**Linha 4 (Amarela)** — OK");

    const state = JSON.parse(store.get(ALARM_STATE_KEY)!);
    expect(state.window).toBe("2026-10-12:morning");
    expect(state.lines["2"]).toEqual({
      status: "CRITICAL",
      situation: "Paralisada",
      description: "trem parado",
    });

    // Same incident: nothing new.
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toHaveLength(1);
  });

  test("resends when the incident details change", async () => {
    const latest = spy(
      spyOn(TrainStatusService, "listLatest").mockResolvedValue([
        line(2, "WARNING", "Reduzida"),
      ] as never),
    );
    spy(spyOn(CalendarService, "listHolidayEvents").mockResolvedValue([] as never));
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toHaveLength(1);
    latest.mockResolvedValue([line(2, "WARNING", "Reduzida", "nova")] as never);
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain("nova");
  });

  test("notifies when an incident recovers, including UNKNOWN", async () => {
    const latest = spy(
      spyOn(TrainStatusService, "listLatest").mockResolvedValue([
        line(2, "CRITICAL", "Paralisada"),
      ] as never),
    );
    spy(spyOn(CalendarService, "listHolidayEvents").mockResolvedValue([] as never));
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toHaveLength(1);

    latest.mockResolvedValue([line(2, "UNKNOWN", "")] as never);
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain("tudo voltou ao normal");

    // Already recovered: no further message.
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toHaveLength(2);
  });

  test("resets the notified state at the start of a new window", async () => {
    setup([line(2, "WARNING", "Reduzida")]);
    await runTrainStatusAlarm(MONDAY_MORNING);
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toHaveLength(1);

    await runTrainStatusAlarm(MONDAY_EVENING);
    expect(sent).toHaveLength(2);
    const state = JSON.parse(store.get(ALARM_STATE_KEY)!);
    expect(state.window).toBe("2026-10-12:evening");
  });

  test("treats a failed holiday lookup as a working day", async () => {
    const error = spy(spyOn(console, "error").mockImplementation(() => {}));
    spy(spyOn(TrainStatusService, "listLatest").mockResolvedValue([
      line(2, "CRITICAL", "Paralisada"),
    ] as never));
    spy(
      spyOn(CalendarService, "listHolidayEvents").mockRejectedValue(
        new Error("calendar down"),
      ),
    );
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toHaveLength(1);
    expect(error).toHaveBeenCalled();
  });

  test("keeps the state unset when the send fails, so it retries", async () => {
    setup([line(2, "CRITICAL", "Paralisada")]);
    failSend = true;
    await expect(runTrainStatusAlarm(MONDAY_MORNING)).rejects.toThrow(
      "evolution down",
    );
    expect(store.has(ALARM_STATE_KEY)).toBe(false);

    failSend = false;
    await runTrainStatusAlarm(MONDAY_MORNING);
    expect(sent).toHaveLength(1);
  });

  test("checkTrainLinesAlarm runs with the current time", async () => {
    setSystemTime(MONDAY_MORNING);
    setup([line(2, "CRITICAL", "Paralisada")]);
    await checkTrainLinesAlarm();
    expect(sent).toHaveLength(1);
  });
});
