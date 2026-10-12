import { db } from "@server/db";
import {
  assistantConversations,
  assistantMessages,
  type StoredAction,
  type StoredImage,
} from "@server/db/schema";

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

/** Most recent messages sent back to the model as context. */
export const MAX_HISTORY_MESSAGES = 12;
/** A conversation idle for longer than this is not resumed by the wake word. */
export const RESUME_WINDOW_MS = 10 * 60 * 1000;
/** Conversation titles are the start of the first message. */
export const TITLE_LENGTH = 60;
/** How many conversations the history list returns. */
export const LIST_LIMIT = 100;

export type Conversation = typeof assistantConversations.$inferSelect;
export type StoredMessage = typeof assistantMessages.$inferSelect;

/** The conversation a turn belongs to; a new one is only saved with its first turn. */
export interface OpenConversation extends Conversation {
  persisted: boolean;
}

export interface NewMessage {
  role: "user" | "assistant";
  text: string;
  actions?: StoredAction[];
  images?: StoredImage[];
}

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > TITLE_LENGTH ? `${clean.slice(0, TITLE_LENGTH - 1)}…` : clean;
}

/**
 * Persistent conversation history, per user. Conversations are kept until the
 * user deletes them; the wake word resumes the latest one if it is recent.
 */
export abstract class ConversationService {
  // explicit ctor: bun cannot count an implicit one as covered
  constructor() {}

  /** One of the user's conversations, or null if it is not theirs. */
  static async find(userId: string, id: string): Promise<Conversation | null> {
    const [row] = await db
      .select()
      .from(assistantConversations)
      .where(and(eq(assistantConversations.id, id), eq(assistantConversations.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * The conversation a new utterance belongs to: the requested one (if it is
   * the user's), else the latest one still open and active within the resume
   * window, else a new one titled after `firstText`. A new conversation is not
   * saved yet: a failed first turn leaves no empty conversation behind.
   */
  static async open(
    userId: string,
    firstText: string,
    conversationId?: string,
    now = new Date(),
  ): Promise<OpenConversation> {
    if (conversationId) {
      const requested = await this.find(userId, conversationId);
      if (requested) return { ...requested, persisted: true };
    } else {
      const [recent] = await db
        .select()
        .from(assistantConversations)
        .where(
          and(
            eq(assistantConversations.userId, userId),
            isNull(assistantConversations.endedAt),
            gte(assistantConversations.updatedAt, new Date(now.getTime() - RESUME_WINDOW_MS)),
          ),
        )
        .orderBy(desc(assistantConversations.updatedAt))
        .limit(1);
      if (recent) return { ...recent, persisted: true };
    }
    return {
      id: crypto.randomUUID(),
      userId,
      title: titleFrom(firstText),
      endedAt: null,
      createdAt: now,
      updatedAt: now,
      persisted: false,
    };
  }

  /** The latest messages of a conversation, oldest first. */
  static async context(conversationId: string): Promise<StoredMessage[]> {
    const rows = await db
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.conversationId, conversationId))
      .orderBy(desc(assistantMessages.createdAt))
      .limit(MAX_HISTORY_MESSAGES);
    return rows.reverse();
  }

  /**
   * Saves one exchange atomically, creating the conversation on its first
   * turn. A goodbye closes the conversation; any other turn (re)opens it.
   */
  static async addTurn(
    conversation: OpenConversation,
    messages: NewMessage[],
    ended: boolean,
    now = new Date(),
  ): Promise<void> {
    const endedAt = ended ? now : null;
    await db.transaction(async (tx) => {
      if (!conversation.persisted) {
        const { id, userId, title, createdAt } = conversation;
        await tx
          .insert(assistantConversations)
          .values({ id, userId, title, createdAt, updatedAt: now, endedAt });
      } else {
        await tx
          .update(assistantConversations)
          .set({ updatedAt: now, endedAt })
          .where(eq(assistantConversations.id, conversation.id));
      }
      await tx.insert(assistantMessages).values(
        messages.map((message, index) => ({
          conversationId: conversation.id,
          role: message.role,
          text: message.text,
          actions: message.actions ?? [],
          images: message.images ?? [],
          // Keep the user's message strictly before the reply.
          createdAt: new Date(now.getTime() + index),
        })),
      );
    });
  }

  /** Closes the user's open conversations so the next one starts fresh. */
  static async endAll(userId: string, now = new Date()): Promise<void> {
    await db
      .update(assistantConversations)
      .set({ endedAt: now })
      .where(and(eq(assistantConversations.userId, userId), isNull(assistantConversations.endedAt)));
  }

  static list(userId: string): Promise<Conversation[]> {
    return db
      .select()
      .from(assistantConversations)
      .where(eq(assistantConversations.userId, userId))
      .orderBy(desc(assistantConversations.updatedAt))
      .limit(LIST_LIMIT);
  }

  static messages(conversationId: string): Promise<StoredMessage[]> {
    return db
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.conversationId, conversationId))
      .orderBy(assistantMessages.createdAt);
  }

  /** Deletes the conversation; returns its images so the caller removes them. */
  static async remove(userId: string, id: string): Promise<StoredImage[] | null> {
    const conversation = await this.find(userId, id);
    if (!conversation) return null;
    const images = (await this.messages(id)).flatMap((message) => message.images);
    await db.delete(assistantConversations).where(eq(assistantConversations.id, id));
    return images;
  }

  /** Every image key some message still refers to (any user). */
  static async referencedImageKeys(): Promise<Set<string>> {
    const rows = await db
      .select({ key: sql<string>`jsonb_array_elements(${assistantMessages.images})->>'key'` })
      .from(assistantMessages);
    return new Set(rows.map((row) => row.key));
  }
}
