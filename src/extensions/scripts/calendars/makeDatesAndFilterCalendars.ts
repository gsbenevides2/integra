import { endOfToday, startOfToday } from "date-fns";
import type { MakedDates } from "./types";
import type { Calendar } from "utils/google/types";

export async function makeDatesAndFilterCalendars(calendars: Calendar[]): Promise<MakedDates> {
    const startDate = startOfToday().toISOString();
    const endDate = endOfToday().toISOString();
    const nonDuplicatedCalendars = calendars.filter(
        (calendar, index, self) =>
            self.findIndex((fc) => fc.calendarId === calendar.calendarId) === index,
    );
    return { startDate, endDate, nonDuplicatedCalendars };
}
