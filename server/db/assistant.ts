import { index, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

import { authUsers } from "./auth";

export const assistant = pgSchema("assistant");

/** Each user's own instructions for the voice assistant. */
export const assistantUserSettings = assistant.table("user_settings", {
  userId: text()
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  extraInstructions: text().notNull().default(""),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** An image attached to a message, stored in the private S3 bucket. */
export interface StoredImage {
  /** Object key; always under `assistant/<userId>/`. */
  key: string;
  mediaType: string;
  /** Who produced it: uploaded by the user, generated, or a camera snapshot. */
  source: "upload" | "generated" | "camera";
  /** Camera name, or the prompt of a generated image. */
  label?: string;
}

/** One action chip shown under an assistant reply. */
export interface StoredAction {
  tool: string;
  ok: boolean;
  summary: string;
}

/** A conversation with the assistant; kept until the user deletes it. */
export const assistantConversations = assistant.table(
  "conversations",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    title: text().notNull(),
    /** Set by a goodbye: the next wake word starts a new conversation. */
    endedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_conversations_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const assistantMessages = assistant.table(
  "messages",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text()
      .notNull()
      .references(() => assistantConversations.id, { onDelete: "cascade" }),
    role: text({ enum: ["user", "assistant"] }).notNull(),
    text: text().notNull(),
    actions: jsonb().$type<StoredAction[]>().notNull().default([]),
    images: jsonb().$type<StoredImage[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);
