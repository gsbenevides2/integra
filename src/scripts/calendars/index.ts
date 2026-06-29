import onCron from "triggers/cron";

import { listSchedullersRequest } from "utils/httpScheduller/listSchedullersRequest";
import { makeDatesAndFilterCalendars } from "./makeDatesAndFilterCalendars";
import { deleteManySchedullerRequests } from "utils/httpScheduller/deleteManySchedullerRequests";

import type { CalendarEvents } from "./types";
import { prepareMessageAndSchedule } from "./prepareMessageAndSchedule";
import { schedulleRequests } from "utils/httpScheduller/schedulleRequests";
import { listCalendarsRequest } from "utils/google/listCalendarsRequest";
import { listEventsFromCalendar } from "utils/google/listEventsFromCalendar";

export const schedullerCalendarMessages = onCron(
    {
        cron: "*/10 * * * *",
        id: "calendars:scheduleMessage",
    },
    async (_, traceId) => {
        const [calendars, schedullers] = await Promise.all([
            listCalendarsRequest(traceId),
            listSchedullersRequest(traceId),
        ]);

        const { startDate, endDate, nonDuplicatedCalendars, schedullersIdsToDelete } =
            await makeDatesAndFilterCalendars(calendars, schedullers);
        if (schedullersIdsToDelete.length)
            await deleteManySchedullerRequests(schedullersIdsToDelete, traceId);
        const events = await Promise.all(
            nonDuplicatedCalendars.map<Promise<CalendarEvents>>(async (calendar) => ({
                events: await listEventsFromCalendar(calendar, startDate, endDate, traceId),
                calendar,
            })),
        );

        const requestsToSchedule = await prepareMessageAndSchedule(events);
        if (requestsToSchedule.length) await schedulleRequests(requestsToSchedule, traceId);
    },
);
