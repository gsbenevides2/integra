import { type gmail_v1, google } from "googleapis";

import { GoogleAccountService } from "./accounts";

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  isUnread: boolean;
}

export interface EmailContent extends EmailSummary {
  body: string;
}

function findHeader(message: gmail_v1.Schema$Message, name: string): string {
  return message.payload?.headers?.find((h) => h.name === name)?.value ?? "";
}

function summarize(message: gmail_v1.Schema$Message): EmailSummary {
  return {
    id: message.id ?? "",
    from: findHeader(message, "From"),
    subject: findHeader(message, "Subject"),
    isUnread: message.labelIds?.includes("UNREAD") ?? false,
  };
}

export abstract class GmailService {
  protected constructor() {}

  static async search(
    email: string,
    query: string,
    maxResults = 500,
  ): Promise<EmailSummary[]> {
    const { authClient } = await GoogleAccountService.getClient(email);
    const gmail = google.gmail({ version: "v1", auth: authClient });
    const list = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
      includeSpamTrash: true,
    });
    const messages = await Promise.all(
      (list.data.messages ?? []).map(async (message) => {
        if (!message.id) return null;
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject"],
        });
        return detail.data;
      }),
    );
    return messages
      .filter((message): message is gmail_v1.Schema$Message => message !== null)
      .map(summarize);
  }

  static async getFull(
    email: string,
    messageId: string,
  ): Promise<EmailContent> {
    const { authClient } = await GoogleAccountService.getClient(email);
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
        (part) =>
          part.mimeType === "text/plain" || part.mimeType === "text/html",
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }
    }

    return { ...summarize(data), body };
  }

  static async findLabelId(
    email: string,
    name: string,
  ): Promise<string | null> {
    const { authClient } = await GoogleAccountService.getClient(email);
    const gmail = google.gmail({ version: "v1", auth: authClient });
    const { data } = await gmail.users.labels.list({ userId: "me" });
    return data.labels?.find((label) => label.name === name)?.id ?? null;
  }

  static async addLabel(
    email: string,
    messageId: string,
    labelId: string,
  ): Promise<void> {
    const { authClient } = await GoogleAccountService.getClient(email);
    const gmail = google.gmail({ version: "v1", auth: authClient });
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds: [labelId] },
    });
  }

  static async listPdfAttachments(
    email: string,
    messageId: string,
  ): Promise<{ subject: string; attachmentIds: string[] }> {
    const { authClient } = await GoogleAccountService.getClient(email);
    const gmail = google.gmail({ version: "v1", auth: authClient });
    const { data } = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
    });
    const subject = findHeader(data, "Subject") || "Sem Assunto";
    const attachmentIds = (data.payload?.parts ?? [])
      .filter((part) => part.mimeType === "application/pdf")
      .map((part) => part.body?.attachmentId)
      .filter((id): id is string => Boolean(id));
    return { subject, attachmentIds };
  }

  static async trash(email: string, messageId: string): Promise<void> {
    const { authClient } = await GoogleAccountService.getClient(email);
    const gmail = google.gmail({ version: "v1", auth: authClient });
    await gmail.users.messages.trash({
      userId: "me",
      id: messageId,
    });
  }

  static async batchDelete(email: string, messageIds: string[]): Promise<void> {
    const { authClient } = await GoogleAccountService.getClient(email);
    const gmail = google.gmail({ version: "v1", auth: authClient });
    await gmail.users.messages.batchDelete({
      userId: "me",
      requestBody: { ids: messageIds },
    });
  }

  static async getAttachment(
    email: string,
    messageId: string,
    attachmentId: string,
  ): Promise<Buffer> {
    const { authClient } = await GoogleAccountService.getClient(email);
    const gmail = google.gmail({ version: "v1", auth: authClient });
    const { data } = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    if (!data.data) throw new Error("Attachment has no data");
    return Buffer.from(data.data, "base64url");
  }
}
