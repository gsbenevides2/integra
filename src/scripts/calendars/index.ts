import onCron from "triggers/cron";
import { loginInAuthentik } from "utils/authentik/login";
import { listCalendarsRequest } from "./listCalendarsRequest";
import { listSchedullersRequest } from "./listSchedullersRequest";
import { makeDatesAndFilterCalendars } from "./makeDatesAndFilterCalendars";
import { deleteManySchedullerRequests } from "./deleteManySchedullerRequests";
import { listEventsFromCalendar } from "./listEventsFromCalendar";
import type { CalendarEvents } from "./types";
import { prepareMessageAndSchedule } from "./prepareMessageAndSchedule";
import { schedulleRequests } from "./schedulleRequests";

export const schedullerCalendarMessages = onCron(
    {
        cron: "@annually",
        id: "calendars:scheduleMessage",
    },
    async (_, traceId) => {
        const { access_token } = await loginInAuthentik(
            {
                client_id: "BosazxWMVtAeXMfI7Hm5lPt3Crr5FFFWXdCdQtan",
            },
            traceId,
        );
        const [calendars, schedullers] = await Promise.all([
            listCalendarsRequest(traceId),
            listSchedullersRequest(access_token, traceId),
        ]);

        const { startDate, endDate, nonDuplicatedCalendars, schedullersIdsToDelete } =
            await makeDatesAndFilterCalendars(calendars, schedullers);
        if (schedullersIdsToDelete.length)
            await deleteManySchedullerRequests(schedullersIdsToDelete, access_token, traceId);
        const events = await Promise.all(
            nonDuplicatedCalendars.map<Promise<CalendarEvents>>(async (calendar) => ({
                events: await listEventsFromCalendar(calendar, startDate, endDate, traceId),
                calendar,
            })),
        );

        const requestsToSchedule = await prepareMessageAndSchedule(events);
        if (requestsToSchedule.length)
            await schedulleRequests(requestsToSchedule, access_token, traceId);
    },
);
