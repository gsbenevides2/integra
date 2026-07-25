import { endOfToday, startOfToday } from "date-fns";
import type { MakedDates } from "./types";
import type { Calendar } from "utils/google/types";
import type { SchedulledRequest } from "utils/httpScheduller/types";

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
        .filter((s) => s.name?.startsWith("calendar-scheduller"))
        .map((s) => s.externalId);
    return { startDate, endDate, nonDuplicatedCalendars, schedullersIdsToDelete };
}
