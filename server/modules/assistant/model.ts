import { z } from "zod";

import type { ImageView } from "./service/images";

/** Longest utterance accepted by the chat and speech routes. */
export const MAX_TEXT_LENGTH = 2000;
/** About a minute of 16 kHz mono 16-bit WAV; recordings are capped well below. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/** Images the user can attach to one message. */
export const MAX_ATTACHED_IMAGES = 4;

export const chatBody = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH).meta({
    title: "Text",
    description: "What the user said (or typed), in Portuguese",
    example: "Liga a luz da sala",
  }),
  conversationId: z.string().uuid().optional().meta({
    title: "Conversation ID",
    description:
      "Continue this conversation. Without it, the latest conversation is " +
      "resumed if it was active in the last 10 minutes, else a new one starts.",
  }),
  images: z.array(z.string().min(1)).max(MAX_ATTACHED_IMAGES).optional().meta({
    title: "Images",
    description: "Keys of images uploaded with POST /api/assistant/uploads",
  }),
});

export type ChatBody = z.infer<typeof chatBody>;

export const ttsBody = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH).meta({
    title: "Text",
    description: "Text to be spoken by the assistant",
    example: "Pronto, liguei a luz da sala.",
  }),
});

/** Longest per-user addition to the system prompt. */
export const MAX_EXTRA_INSTRUCTIONS_LENGTH = 4000;

export const settingsBody = z.object({
  extraInstructions: z.string().trim().max(MAX_EXTRA_INSTRUCTIONS_LENGTH).meta({
    title: "Extra Instructions",
    description:
      "The user's own instructions, added to the assistant's system prompt " +
      "when they talk to it (e.g. nickname, tone, room names). Empty to clear.",
    example: "A luz da sala é a 'Lâmpada Philips'. Chame o usuário de Gui.",
  }),
});

export type AssistantSettings = z.infer<typeof settingsBody>;

/** One tool call the agent made while answering, shown as a chip in the UI. */
export interface AssistantAction {
  tool: string;
  ok: boolean;
  summary: string;
  /** Tool description, shown in the details modal. */
  description?: string;
  /** Arguments the model sent. */
  input?: unknown;
  /** Sanitized tool result, shown in the details modal. */
  output?: unknown;
  /** Wall-clock time spent in the tool. */
  durationMs?: number;
}

/** What one turn cost, across every model call it made (tools included). */
export interface AssistantUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Prompt tokens served from the provider's cache. */
  cachedTokens: number;
  reasoningTokens: number;
  /** USD, when OpenRouter reported cost accounting. */
  cost?: number;
  /** Model round-trips (one per LLM call, not per tool). */
  modelCalls: number;
  durationMs: number;
}

export interface ChatReply {
  conversationId: string;
  reply: string;
  actions: AssistantAction[];
  /** Images generated or captured (cameras) while answering. */
  images: ImageView[];
  /** The user said goodbye: speak the reply, then stop listening. */
  endConversation: boolean;
  /** The utterance was not for the assistant: no reply is spoken, only a chime. */
  silent?: boolean;
  /** Token and cost accounting for this turn. */
  usage?: AssistantUsage;
  /** Same accounting accumulated over the whole conversation. */
  conversationUsage?: AssistantUsage;
}

/**
 * Events of `POST /api/assistant/chat/stream`, one per SSE `data:` line, in
 * order: conversation, then any tool/action/image/delta, then done (or error).
 */
export type StreamEvent =
  | {
      type: "conversation";
      conversationId: string;
      /** The server continued a recent conversation instead of starting one. */
      resumed?: boolean;
      /** Title of the resumed conversation, for the context banner. */
      title?: string;
      /** Usage accumulated before this turn, when the conversation was resumed. */
      usage?: AssistantUsage | null;
      /** Messages already in the model's context (only when resumed). */
      messages?: MessageView[];
    }
  /** A tool started; the browser shows what is happening ("Gerando imagem…"). */
  | { type: "tool"; tool: string }
  | { type: "action"; action: AssistantAction }
  | { type: "image"; image: ImageView }
  /** A piece of the reply text, for the typing effect. */
  | { type: "delta"; text: string }
  /** The final reply; its text replaces whatever was streamed. */
  | { type: "done"; reply: ChatReply }
  | { type: "error"; message: string };

export type EmitStreamEvent = (event: StreamEvent) => void;

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: Date;
  ended: boolean;
  /** Usage accumulated over the whole conversation, when it was recorded. */
  usage: AssistantUsage | null;
}

export interface MessageView {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: AssistantAction[];
  images: ImageView[];
  createdAt: Date;
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageView[];
}

export interface AssistantConfig {
  wakeWordEnabled: boolean;
}
