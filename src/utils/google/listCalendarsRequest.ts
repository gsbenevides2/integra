import { google } from "googleapis";
import { getAllClients } from "./authService";
import type { Calendar } from "./types";

export async function listCalendarsRequest(_traceId: string): Promise<Calendar[]> {
    const clients = await getAllClients();
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
