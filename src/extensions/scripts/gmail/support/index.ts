import onCron from "core/triggers/cron";
import { getUnreadEmails } from "./getEmails";
import { getEmail } from "utils/google/getEmail";
import { processEmailOverAI } from "./processEmailOverAI";
import sendDiscordMessage from "utils/discord/sendMessage";

export const gmailSuport = onCron(
    {
        cron: "*/1 * * * *",
        id: "gmail:suport",
    },
    async (_, traceId) => {
        const emails = await getUnreadEmails(traceId);
        if (emails.length === 0) return;
        const emailsContent = await Promise.all(
            emails.map(({ id }) => getEmail("guilherme.benevides@econverse.com.br", id, traceId)),
        );
        const messages = await Promise.all(
            emailsContent.map((content) => processEmailOverAI(content, traceId)),
        );
        await Promise.all(
            messages.map((message) => (message ? sendDiscordMessage(message, traceId) : null)),
        );
    },
);
