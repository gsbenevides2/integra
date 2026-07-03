import { parseISO, differenceInMilliseconds, subMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { CalendarEvents, EventWithCalendar } from "./types";
import { DISCORD_CHANNEL_ID, DISCORD_PUBLIC_KEY } from "utils/discord/sendMessage";
import type { SchedulledRequest } from "utils/httpScheduller/types";

export function prepareMessageAndSchedule(events: CalendarEvents[]): SchedulledRequest[] {
    function formatEventMessage(data: EventWithCalendar) {
        const email = data.calendar.email;
        const dateTime = parseISO(data.start_date);
        let message =
            "🌸 Konnichiwa, senpai! A Bene-Chan aqui está te lembrando de um evento super importante que está chegando~ (✿◠‿◠)";
        message += `\n\n✨ **Evento:** ${data.summary}`;
        const formatedDate = formatInTimeZone(dateTime, "America/Sao_Paulo", "dd/MM/yyyy HH:mm");
        message += `\n📅 **Data:** ${formatedDate}`;
        let description = data.description;
        const MAX_DESCRIPTION_LENGTH = 50;
        if (description) {
            if (description.length > MAX_DESCRIPTION_LENGTH) {
                description = description.slice(0, MAX_DESCRIPTION_LENGTH) + "...";
            }
            message += `\n📝 **Descrição:** ${description}`;
        }
        const location = data.location;
        if (location) {
            message += `\n📍 **Local:** ${location}`;
        }
        const htmlLink = data.htmlLink;
        if (htmlLink) {
            const link = new URL(htmlLink);
            if (link.host.includes("google")) {
                link.searchParams.set("authuser", email);
            }
            message += `\n🔗 **Link para evento:** ${link.toString()}`;
        }
        const conferenceDataURI = data.conference_data.at(0)?.uri;
        if (conferenceDataURI) {
            const uri = new URL(conferenceDataURI);
            if (uri.host.includes("google")) {
                uri.searchParams.set("authuser", email);
            }
            message += `\n💻 **Link para reunião:** ${uri.toString()}`;
        }
        message += "\n\n💪 Ganbatte, senpai! Você consegue~ (◕‿◕)✨";
        return { message };
    }

    const getTriggerValue = (event: EventWithCalendar) => {
        const date = parseISO(event.start_date);
        const triggerValue = subMinutes(date, 1).toISOString().split("-").slice(0, 3).join("-");
        return triggerValue;
    };

    const allEvents = events.flatMap(({ events, calendar }) =>
        events.map<EventWithCalendar>((event) => ({ ...event, calendar })),
    );
    const isHoliday = allEvents.some((event) =>
        event.description.toLowerCase().includes(`feriado`),
    );
    const isFerias = allEvents.some((event) => event.summary.toLowerCase().includes(`férias`));
    const checkIsEconverseEvent = (event: EventWithCalendar) =>
        event.calendar.email.endsWith("@econverse.com.br");
    const checkIfEventIsInTheFuture = (event: EventWithCalendar) =>
        differenceInMilliseconds(parseISO(event.start_date), new Date()) > 0;
    const NON_EVENTS = ["workingLocation", "focusTime", "birthday", "outOfOffice"];

    const eventsToSchedule = allEvents
        .filter((event) => !NON_EVENTS.includes(event.event_type))
        .filter((event) => checkIsEconverseEvent(event) && (isHoliday || isFerias) === false) // Filtra eventos da econverse e se não for ferias ou feriado
        .filter((event) => checkIfEventIsInTheFuture(event)); // Filtra eventos que ainda não aconteceram

    const schedulledRequests = eventsToSchedule.map<SchedulledRequest>((event) => {
        const { message } = formatEventMessage(event);
        const triggerValue = getTriggerValue(event);
        const externalId = `calendar-scheduller-${event.id}`;
        return {
            externalId,
            triggerType: "date",
            excludeBeforeExecution: true,
            triggerValue,
            url: `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
            method: "POST",
            headers: {
                Authorization: `Bot ${DISCORD_PUBLIC_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: message,
            }),
        };
    });
    return schedulledRequests;
}
