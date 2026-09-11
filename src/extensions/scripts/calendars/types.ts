import type { Calendar, Event } from "utils/google/types";

export interface CalendarEvents {
    calendar: Calendar;
    events: Event[];
}
export interface EventWithCalendar extends Event {
    calendar: Calendar;
}

export interface MakedDates {
    startDate: string;
    endDate: string;
    nonDuplicatedCalendars: Calendar[];
}

export interface PendingMessage {
    name: string;
    triggerValue: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
}
