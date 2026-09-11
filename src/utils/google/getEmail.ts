import { google } from "googleapis";
import { getClient } from "./authService";
import type { EmailResponse } from "./types";

export async function getEmail(
    email: string,
    messageId: string,
    _traceId: string,
): Promise<EmailResponse> {
    const { authClient } = await getClient(email);
    const gmail = google.gmail({ version: "v1", auth: authClient });
    const { data } = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
    });

    let body = "";
    if (data.payload?.body?.data) {
        body = Buffer.from(data.payload.body.data, "base64").toString("utf-8");
    } else if (data.payload?.parts) {
        const textPart = data.payload.parts.find(
            (part) => part.mimeType === "text/plain" || part.mimeType === "text/html",
        );
        if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
        }
    }

    const findHeader = (name: string) =>
        data.payload?.headers?.find((h) => h.name === name)?.value ?? "";

    return {
        id: data.id ?? "",
        from: findHeader("From"),
        to: findHeader("To"),
        subject: findHeader("Subject"),
        date: findHeader("Date"),
        body,
        isUnread: data.labelIds?.includes("UNREAD") ?? false,
        threadId: data.threadId ?? "",
    };
}
