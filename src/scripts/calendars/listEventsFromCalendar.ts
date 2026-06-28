import { instrumentableFetch } from "instrumentation";
import type { Calendar, Event } from "./types";

export async function listEventsFromCalendar(
    calendar: Calendar,
    startDate: string,
    endDate: string,
    traceId: string,
): Promise<Event[]> {
    const url = new URL(`https://google.local.gui.dev.br/api/google-calendar/list-events`);
    url.searchParams.append("email", calendar.email);
    url.searchParams.append("calendarId", calendar.calendarId);
    url.searchParams.append("timeMin", startDate);
    url.searchParams.append("timeMax", endDate);
    url.searchParams.append("maxResults", "10");
    url.searchParams.append("orderBy", "startTime");
    url.searchParams.append("singleEvents", "true");
    const headers = {
        Authorization: "Barrissa1#",
    };
    const response = await instrumentableFetch(traceId, url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch events: ${response.statusText}`);
    return (await response.json()) as Event[];
}
