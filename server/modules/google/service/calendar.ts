import { type calendar_v3, google } from "googleapis";

import { GoogleAccountService } from "./accounts";

/**
 * Google's public "Holidays in Brazil" calendar. Events are all-day and carry the
 * holiday kind in `description` (e.g. "Feriado público", "Feriado regional (São Paulo)").
 */
export const BRAZILIAN_HOLIDAYS_CALENDAR_ID =
  "pt-br.brazilian#holiday@group.v.calendar.google.com";

export interface Calendar {
  email: string;
  primary: boolean;
  summary: string;
  calendarId: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
  htmlLink: string;
  eventType: string;
  attendees: { email: string; responseStatus: string }[];
  conferenceUris: string[];
}

function formatEvent(e: calendar_v3.Schema$Event): CalendarEvent {
  return {
    id: e.id ?? "",
    summary: e.summary ?? "",
    description: e.description ?? "",
    // All-day events (e.g. holidays) expose `date` instead of `dateTime`.
    startDate: e.start?.dateTime ?? e.start?.date ?? "",
    endDate: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location ?? "",
    htmlLink: e.htmlLink ?? "",
    eventType: e.eventType ?? "default",
    attendees: (e.attendees ?? []).map((a) => ({
      email: a.email ?? "",
      responseStatus: a.responseStatus ?? "needsAction",
    })),
    conferenceUris: (e.conferenceData?.entryPoints ?? [])
      .map((entryPoint) => entryPoint.uri)
      .filter((uri): uri is string => Boolean(uri)),
  };
}

export abstract class CalendarService {
  protected constructor() {}

  static async listCalendars(): Promise<Calendar[]> {
    const clients = await GoogleAccountService.getAllClients();
    const calendars = await Promise.all(
      clients.map(async ({ email, authClient }) => {
        const calendar = google.calendar({ version: "v3", auth: authClient });
        const { data } = await calendar.calendarList.list();
        return (data.items ?? []).map((item) => ({
          email,
          primary: item.primary ?? false,
          summary: item.summary ?? "",
          calendarId: item.id ?? "",
        }));
      }),
    );
    return calendars.flat();
  }

  static async listEvents(
    calendarInfo: Calendar,
    startDate: string,
    endDate: string,
  ): Promise<CalendarEvent[]> {
    const { authClient } = await GoogleAccountService.getClient(
      calendarInfo.email,
    );
    const calendar = google.calendar({ version: "v3", auth: authClient });
    const { data } = await calendar.events.list({
      calendarId: calendarInfo.calendarId,
      timeMin: startDate,
      timeMax: endDate,
      maxResults: 10,
      orderBy: "startTime",
      singleEvents: true,
    });
    return (data.items ?? []).map(formatEvent);
  }

  /**
   * Reads events from Google's public Brazilian holiday calendar using the first
   * connected account. Callers get raw events so they can decide which holiday
   * kinds matter to them (national vs. regional vs. observance).
   */
  static async listHolidayEvents(
    startDate: string,
    endDate: string,
  ): Promise<CalendarEvent[]> {
    const [client] = await GoogleAccountService.getAllClients();
    if (!client) throw new Error("No connected Google account");
    const calendar = google.calendar({ version: "v3", auth: client.authClient });
    const { data } = await calendar.events.list({
      calendarId: BRAZILIAN_HOLIDAYS_CALENDAR_ID,
      timeMin: startDate,
      timeMax: endDate,
      maxResults: 50,
      orderBy: "startTime",
      singleEvents: true,
    });
    return (data.items ?? []).map(formatEvent);
  }
}
