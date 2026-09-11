import { instrumentableFetch } from "core/instrumentation";
import onCron from "core/triggers/cron";
import { getPendingMessages, setPendingMessages } from "./pendingMessagesCache";

export const sendCalendarScheduledMessages = onCron(
    {
        cron: "* * * * *",
        id: "calendars:sendScheduledMessages",
    },
    async (_, traceId) => {
        const pendingMessages = await getPendingMessages();
        if (!pendingMessages.length) return;

        const now = new Date();
        const dueMessages = pendingMessages.filter(
            (message) => new Date(message.triggerValue) <= now,
        );
        if (!dueMessages.length) return;

        await Promise.all(
            dueMessages.map((message) =>
                instrumentableFetch(traceId, message.url, {
                    method: message.method,
                    headers: message.headers,
                    body: message.body,
                }),
            ),
        );

        const dueNames = new Set(dueMessages.map((message) => message.name));
        const remainingMessages = pendingMessages.filter((message) => !dueNames.has(message.name));
        await setPendingMessages(remainingMessages);
    },
);
