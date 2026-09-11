import onCron from "core/triggers/cron";

import { makeDatesAndFilterCalendars } from "./makeDatesAndFilterCalendars";

import type { CalendarEvents } from "./types";
import { prepareMessageAndSchedule } from "./prepareMessageAndSchedule";
import { setPendingMessages } from "./pendingMessagesCache";
import { listCalendarsRequest } from "utils/google/listCalendarsRequest";
import { listEventsFromCalendar } from "utils/google/listEventsFromCalendar";

export const schedullerCalendarMessages = onCron(
    {
        cron: "*/10 * * * *",
        id: "calendars:scheduleMessage",
    },
    async (_, traceId) => {
        const calendars = await listCalendarsRequest(traceId);

        const { startDate, endDate, nonDuplicatedCalendars } =
            await makeDatesAndFilterCalendars(calendars);
        const events = await Promise.all(
            nonDuplicatedCalendars.map<Promise<CalendarEvents>>(async (calendar) => ({
                events: await listEventsFromCalendar(calendar, startDate, endDate, traceId),
                calendar,
            })),
        );

        const pendingMessages = prepareMessageAndSchedule(events);
        await setPendingMessages(pendingMessages);
    },
);
