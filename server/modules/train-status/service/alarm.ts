import { getLogger, logError } from "@server/instrumentation/instrumentLogger";
import {
  type CalendarEvent,
  CalendarService,
} from "@server/modules/google/service/calendar";
import { redisGet, redisSet } from "@server/shared/cache";
import { sendEvolutionMessage } from "@server/shared/evolution";

import { trace } from "@opentelemetry/api";

import { TRAIN_LINES, type TrainLineStatus } from "../model";
import { TrainStatusService } from "./checks";

const log = getLogger("train-status.alarm");

/** Lines the alarm watches, by numeric code: 2 (Verde), 4 (Amarela), 9 (Esmeralda), 10 (Turquesa). */
export const MONITORED_LINE_CODES = [2, 4, 9, 10];

/** Single Redis key holding the last notified state, scoped by window. */
export const ALARM_STATE_KEY = "trainStatus:alarm:state";

const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";

// Windows are half-open: [start, end).
const MORNING_START_MINUTES = 4 * 60;
const MORNING_END_MINUTES = 9 * 60;
const EVENING_START_MINUTES = 17 * 60;
const EVENING_END_MINUTES = 20 * 60;

export type AlarmWindow = "morning" | "evening";
export type AlarmChange = "incident" | "recovery";

export interface AlarmLineState {
  status: TrainLineStatus;
  situation: string;
  description: string | null;
}

export interface AlarmLine extends AlarmLineState {
  code: number;
  color: string;
  change: AlarmChange | null;
}

interface StoredAlarmState {
  /** `${YYYY-MM-DD}:${morning|evening}` — a new window resets the comparison. */
  window: string;
  lines: Record<string, AlarmLineState>;
}

interface SaoPauloParts {
  date: string;
  weekday: string;
  minutes: number;
}

/**
 * Resolves the date, weekday and time-of-day in São Paulo regardless of the
 * process timezone, so day/window gating never depends on `TZ`.
 */
function saoPauloParts(now: Date): SaoPauloParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** The active alarm window, or null when outside 04:00–08:59 / 17:00–19:59. */
export function getAlarmWindow(now: Date): AlarmWindow | null {
  const { minutes } = saoPauloParts(now);
  if (minutes >= MORNING_START_MINUTES && minutes < MORNING_END_MINUTES)
    return "morning";
  if (minutes >= EVENING_START_MINUTES && minutes < EVENING_END_MINUTES)
    return "evening";
  return null;
}

/** Mondays and Tuesdays only, in São Paulo time. */
export function isAlarmDay(now: Date): boolean {
  const { weekday } = saoPauloParts(now);
  return weekday === "Mon" || weekday === "Tue";
}

/** Stable identifier for the current window; used to reset dedup state. */
export function alarmWindowKey(now: Date, window: AlarmWindow): string {
  return `${saoPauloParts(now).date}:${window}`;
}

/**
 * RFC3339 bounds covering today in São Paulo. Brazil dropped DST in 2019, so a
 * fixed -03:00 offset is exact for America/Sao_Paulo.
 */
export function saoPauloDayRange(now: Date): { start: string; end: string } {
  const { date } = saoPauloParts(now);
  const end = new Date(`${date}T00:00:00-03:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    start: `${date}T00:00:00-03:00`,
    end: `${end.toISOString().slice(0, 10)}T00:00:00-03:00`,
  };
}

/**
 * National holidays and São Paulo regional holidays (state/capital) skip the
 * alarm. Observances and optional days off (Carnaval, Dia das Mães, ...) do not.
 */
export function isHolidayEvent(event: CalendarEvent): boolean {
  const description = event.description.toLowerCase();
  if (description.includes("feriado público")) return true;
  return (
    description.includes("feriado regional") && description.includes("são paulo")
  );
}

export async function isHolidayToday(now: Date): Promise<boolean> {
  const { start, end } = saoPauloDayRange(now);
  const events = await CalendarService.listHolidayEvents(start, end);
  return events.some(isHolidayEvent);
}

function isIncident(status: TrainLineStatus): boolean {
  return status === "WARNING" || status === "CRITICAL";
}

/**
 * Whether the line needs a notification given what was last notified:
 * a new/changed incident, or a recovery from a previously notified incident.
 * UNKNOWN counts as normal.
 */
export function resolveChange(
  current: AlarmLineState,
  previous: AlarmLineState | undefined,
): AlarmChange | null {
  if (isIncident(current.status)) {
    const unchanged =
      previous &&
      isIncident(previous.status) &&
      previous.situation === current.situation &&
      previous.description === current.description;
    return unchanged ? null : "incident";
  }
  if (previous && isIncident(previous.status)) return "recovery";
  return null;
}

function lineIcon(line: AlarmLine): string {
  if (line.change === "recovery") return "💚";
  if (line.status === "CRITICAL") return "🚨";
  if (line.status === "WARNING") return "⚠️";
  if (line.status === "OK") return "✅";
  return "❔";
}

/** Fixed Bene-Chan style template showing the full picture of the monitored lines. */
export function buildAlarmMessage(lines: AlarmLine[]): string {
  const hasIncidentChange = lines.some((line) => line.change === "incident");
  const hasRecovery = lines.some((line) => line.change === "recovery");
  const hasActiveIncident = lines.some((line) => isIncident(line.status));

  let message: string;
  if (hasIncidentChange) {
    message =
      "🚨 Kyaa~ senpai!! A Bene-Chan detectou um probleminha nas linhas de trem! (╥﹏╥)\n\nCorre pra ver, tá? A situação tá assim:";
  } else if (hasRecovery && hasActiveIncident) {
    message =
      "🔧 Oi, senpai! Algumas linhas voltaram ao normal, mas ainda tem uma coisinha rolando~ (◕‿◕)";
  } else if (hasRecovery) {
    message =
      "✨ Ufa~ senpai! Boa notícia: tudo voltou ao normal! (◕‿◕)♡\n\nOlha como as linhas estão agora:";
  } else {
    message =
      "📢 Oi, senpai! A Bene-Chan passou pra atualizar o status das linhas~ (✿◠‿◠)";
  }

  for (const line of lines) {
    message += `\n\n${lineIcon(line)} **Linha ${line.code} (${line.color})** — ${line.status}`;
    if (line.situation) message += `\n   📋 ${line.situation}`;
    if (line.description) message += `\n   📝 ${line.description}`;
    if (line.change === "recovery")
      message += "\n   💚 Voltou ao normal, que alívio!";
  }

  message += hasActiveIncident
    ? "\n\n💪 Ganbatte, senpai! A Bene-Chan fica de olho aqui~ (◕‿◕)✨"
    : "\n\n🌸 Tudo tranquilo por enquanto! A Bene-Chan segue vigilante, ne? (✿◠‿◠)✨";
  return message;
}

async function readState(): Promise<StoredAlarmState | null> {
  const raw = await redisGet(ALARM_STATE_KEY);
  return raw ? (JSON.parse(raw) as StoredAlarmState) : null;
}

async function writeState(state: StoredAlarmState): Promise<void> {
  await redisSet(ALARM_STATE_KEY, JSON.stringify(state));
}

/**
 * Cron entry point: gate on day/window/holiday, compare the latest line statuses
 * with what was last notified and send a single grouped WhatsApp message when
 * anything changed. State is only persisted after a successful send, so a failed
 * delivery is retried on the next run.
 */
export async function runTrainStatusAlarm(now: Date): Promise<void> {
  const span = trace.getActiveSpan();

  const window = getAlarmWindow(now);
  if (!window || !isAlarmDay(now)) {
    span?.setAttribute("trainStatus.alarm.skip", "schedule");
    return;
  }

  const windowKey = alarmWindowKey(now, window);

  let holiday = false;
  try {
    holiday = await isHolidayToday(now);
  } catch (error) {
    // A failed calendar lookup must not silence the alarm: treat it as a working day.
    span?.setAttribute("trainStatus.alarm.holidayCheckFailed", true);
    logError(log, "Falha ao consultar o calendário de feriados.", error);
  }

  if (holiday) {
    span?.setAttribute("trainStatus.alarm.skip", "holiday");
    return;
  }

  const latest = await TrainStatusService.listLatest();
  const byCode = new Map(latest.map((line) => [line.lineCode, line]));

  const current: AlarmLine[] = TRAIN_LINES.filter((line) =>
    MONITORED_LINE_CODES.includes(line.code),
  ).map((line) => {
    const row = byCode.get(line.code);
    return {
      code: line.code,
      color: line.color,
      status: row?.status ?? "UNKNOWN",
      situation: row?.situation ?? "",
      description: row?.description ?? null,
      change: null,
    };
  });

  const stored = await readState();
  const previous = stored?.window === windowKey ? stored.lines : undefined;

  const lines = current.map((line) => ({
    ...line,
    change: resolveChange(line, previous?.[String(line.code)]),
  }));

  if (lines.every((line) => line.change === null)) {
    span?.setAttribute("trainStatus.alarm.notified", false);
    return;
  }

  await sendEvolutionMessage(buildAlarmMessage(lines));

  await writeState({
    window: windowKey,
    lines: Object.fromEntries(
      lines.map((line) => [
        String(line.code),
        {
          status: line.status,
          situation: line.situation,
          description: line.description,
        },
      ]),
    ),
  });

  span?.setAttribute("trainStatus.alarm.notified", true);
}
