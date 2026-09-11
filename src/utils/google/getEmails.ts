import { type gmail_v1, google } from "googleapis";
import { getClient } from "./authService";
import type { EmailListResponse } from "./types";

interface Params {
    q?: string;
    maxResults: number;
    email: string;
    includeSpamTrash?: boolean;
}

function findHeader(message: gmail_v1.Schema$Message, name: string) {
    return message.payload?.headers?.find((h) => h.name === name)?.value ?? "";
}

function formatMessage(message: gmail_v1.Schema$Message): EmailListResponse {
    return {
        id: message.id ?? "",
        from: findHeader(message, "From"),
        to: findHeader(message, "To"),
        subject: findHeader(message, "Subject"),
        date: findHeader(message, "Date"),
        isUnread: message.labelIds?.includes("UNREAD") ?? false,
    };
}

export async function getEmails(params: Params, _traceId: string): Promise<EmailListResponse[]> {
    const { authClient } = await getClient(params.email);
    const gmail = google.gmail({ version: "v1", auth: authClient });

    const list = await gmail.users.messages.list({
        userId: "me",
        maxResults: params.maxResults,
        q: params.q,
        includeSpamTrash: params.includeSpamTrash,
    });

    const messages = await Promise.all(
        (list.data.messages ?? []).map(async (message) => {
            if (!message.id) return null;
            const detail = await gmail.users.messages.get({
                userId: "me",
                id: message.id,
                format: "metadata",
                metadataHeaders: ["From", "To", "Subject", "Date"],
            });
            return detail.data;
        }),
    );

    return messages
        .filter((message): message is gmail_v1.Schema$Message => message !== null)
        .map(formatMessage);
}
