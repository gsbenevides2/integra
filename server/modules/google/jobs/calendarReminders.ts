import { redisGet, redisSet } from "@server/shared/cache";
import { sendDiscordMessage } from "@server/shared/discord";

import { type CalendarEvent,CalendarService } from "../service/calendar";

const OWNER_EMAIL = "guilherme.benevides@econverse.com.br";
const ORG_DOMAIN = "@econverse.com.br";
const NON_EVENTS = new Set([
  "workingLocation",
  "focusTime",
  "birthday",
  "outOfOffice",
]);
const PENDING_KEY = "google:calendar:pending";
const MAX_DESCRIPTION_LENGTH = 50;

interface PendingReminder {
  eventId: string;
  triggerAt: string;
  message: string;
}

function startOfTodayISO(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfTodayISO(): string {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function formatSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

function formatEventMessage(event: CalendarEvent, calendarEmail: string): string {
  let message =
    "🌸 Konnichiwa, senpai! A Bene-Chan aqui está te lembrando de um evento super importante que está chegando~ (✿◠‿◠)";
  message += `\n\n✨ **Evento:** ${event.summary}`;
  message += `\n📅 **Data:** ${formatSaoPaulo(new Date(event.startDate))}`;
  if (event.description) {
    const description =
      event.description.length > MAX_DESCRIPTION_LENGTH
        ? `${event.description.slice(0, MAX_DESCRIPTION_LENGTH)}...`
        : event.description;
    message += `\n📝 **Descrição:** ${description}`;
  }
  if (event.location) message += `\n📍 **Local:** ${event.location}`;
  if (event.htmlLink) {
    const link = new URL(event.htmlLink);
    if (link.host.includes("google")) link.searchParams.set("authuser", calendarEmail);
    message += `\n🔗 **Link para evento:** ${link.toString()}`;
  }
  const conferenceUri = event.conferenceUris.at(0);
  if (conferenceUri) {
    const uri = new URL(conferenceUri);
    if (uri.host.includes("google")) uri.searchParams.set("authuser", calendarEmail);
    message += `\n💻 **Link para reunião:** ${uri.toString()}`;
  }
  message += "\n\n💪 Ganbatte, senpai! Você consegue~ (◕‿◕)✨";
  return message;
}

async function getPending(): Promise<PendingReminder[]> {
  const raw = await redisGet(PENDING_KEY);
  return raw ? (JSON.parse(raw) as PendingReminder[]) : [];
}

async function setPending(reminders: PendingReminder[]): Promise<void> {
  await redisSet(PENDING_KEY, JSON.stringify(reminders));
}

export async function scheduleCalendarMessages(): Promise<void> {
  const calendars = await CalendarService.listCalendars();
  const uniqueCalendars = calendars.filter(
    (calendar, index, self) =>
      self.findIndex((c) => c.calendarId === calendar.calendarId) === index,
  );
  const startDate = startOfTodayISO();
  const endDate = endOfTodayISO();

  const eventsByCalendar = await Promise.all(
    uniqueCalendars.map(async (calendar) => ({
      calendar,
      events: await CalendarService.listEvents(calendar, startDate, endDate),
    })),
  );

  const allEvents = eventsByCalendar.flatMap(({ calendar, events }) =>
    events.map((event) => ({ event, calendar })),
  );
  const isHoliday = allEvents.some(({ event }) =>
    event.description.toLowerCase().includes("feriado"),
  );
  const isFerias = allEvents.some(({ event }) =>
    event.summary.toLowerCase().includes("férias"),
  );

  const eventsToSchedule = allEvents
    .filter(({ event }) => !NON_EVENTS.has(event.eventType))
    .filter(
      ({ calendar }) =>
        calendar.email.endsWith(ORG_DOMAIN) && !isHoliday && !isFerias,
    )
    .filter(({ event }) => new Date(event.startDate).getTime() > Date.now())
    .filter(({ event }) => {
      const ownerAttendance = event.attendees.find(
        (a) => a.email === OWNER_EMAIL,
      );
      return ownerAttendance?.responseStatus !== "declined";
    });

  const reminders: PendingReminder[] = eventsToSchedule.map(
    ({ event, calendar }) => ({
      eventId: event.id,
      triggerAt: new Date(
        new Date(event.startDate).getTime() - 60_000,
      ).toISOString(),
      message: formatEventMessage(event, calendar.email),
    }),
  );

  await setPending(reminders);
}

export async function sendScheduledMessages(): Promise<void> {
  const pending = await getPending();
  if (pending.length === 0) return;

  const now = Date.now();
  const due = pending.filter(
    (reminder) => new Date(reminder.triggerAt).getTime() <= now,
  );
  if (due.length === 0) return;

  await Promise.all(due.map((reminder) => sendDiscordMessage(reminder.message)));

  const dueIds = new Set(due.map((reminder) => reminder.eventId));
  await setPending(pending.filter((reminder) => !dueIds.has(reminder.eventId)));
}
