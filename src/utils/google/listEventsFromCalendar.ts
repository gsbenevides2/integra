import { type calendar_v3, google } from "googleapis";
import { getClient } from "./authService";
import type { Calendar, Event } from "./types";

function formatEvent(e: calendar_v3.Schema$Event): Event {
    return {
        id: e.id ?? "",
        summary: e.summary ?? "",
        description: e.description ?? "",
        start_date: e.start?.dateTime ?? "",
        end_date: e.end?.dateTime ?? "",
        attendees:
            e.attendees?.map((a) => ({
                display_name: a.displayName ?? "",
                email: a.email ?? "",
                response_status:
                    (a.responseStatus as Event["attendees"][number]["response_status"]) ??
                    "needsAction",
            })) ?? [],
        location: e.location ?? "",
        color_id: e.colorId ?? "",
        hangout_link: e.hangoutLink ?? "",
        reminders: {
            use_default: e.reminders?.useDefault ?? false,
            overrides:
                e.reminders?.overrides?.map((o) => ({
                    method: (o.method as "email" | "popup") ?? "email",
                })) ?? [],
        },
        organizer: {
            self: e.organizer?.self ?? false,
            display_name: e.organizer?.displayName ?? "",
            email: e.organizer?.email ?? "",
        },
        work_location_properties: {
            type:
                (e.workingLocationProperties
                    ?.type as Event["work_location_properties"]["type"]) ?? "officeLocation",
        },
        birthday_properties: {
            type:
                (e.birthdayProperties?.type as Event["birthday_properties"]["type"]) ?? "other",
        },
        event_type: (e.eventType as Event["event_type"]) ?? "default",
        htmlLink: e.htmlLink ?? "",
        conference_data:
            e.conferenceData?.entryPoints?.map((ep) => ({
                uri: ep.uri ?? "",
                label: ep.label ?? "",
            })) ?? [],
    };
}

export async function listEventsFromCalendar(
    calendarInfo: Calendar,
    startDate: string,
    endDate: string,
    _traceId: string,
): Promise<Event[]> {
    const { authClient } = await getClient(calendarInfo.email);
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
