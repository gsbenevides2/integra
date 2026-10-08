import { type calendar_v3, google } from "googleapis";

import { GoogleAccountService } from "./accounts";

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
    startDate: e.start?.dateTime ?? "",
    endDate: e.end?.dateTime ?? "",
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
}
