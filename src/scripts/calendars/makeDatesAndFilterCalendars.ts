import { endOfToday, startOfToday } from "date-fns";
import type { Calendar, MakedDates, SchedulledRequest } from "./types";

export async function makeDatesAndFilterCalendars(
    calendars: Calendar[],
    schedullers: SchedulledRequest[],
): Promise<MakedDates> {
    const startDate = startOfToday().toISOString();
    const endDate = endOfToday().toISOString();
    const nonDuplicatedCalendars = calendars.filter(
        (calendar, index, self) =>
            self.findIndex((fc) => fc.calendarId === calendar.calendarId) === index,
    );
    const schedullersIdsToDelete = schedullers
        .map((m) => m.externalId)
        .filter((id) => id.startsWith("calendar-scheduller"));
    return { startDate, endDate, nonDuplicatedCalendars, schedullersIdsToDelete };
}
