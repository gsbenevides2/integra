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

/** Default cosine cutoff for the wake-word speaker check: strict by default. */
export const DEFAULT_VOICE_MATCH_THRESHOLD = 0.6;

export const settingsBody = z.object({
  extraInstructions: z.string().trim().max(MAX_EXTRA_INSTRUCTIONS_LENGTH).meta({
    title: "Extra Instructions",
    description:
      "The user's own instructions, added to the assistant's system prompt " +
      "when they talk to it (e.g. nickname, tone, room names). Empty to clear.",
    example: "A luz da sala é a 'Lâmpada Philips'. Chame o usuário de Gui.",
  }),
  voiceMatchThreshold: z.number().min(0).max(1).meta({
    title: "Voice Match Threshold",
    description:
      "Cosine-similarity cutoff for the wake-word speaker check. Higher is " +
      "stricter. Only applies once the user has enrolled a voice profile.",
    example: 0.6,
  }),
});

export type AssistantSettings = z.infer<typeof settingsBody>;

/** How many enrolment samples the client sends, and their embedding limits. */
export const MIN_VOICE_SAMPLES = 1;
export const MAX_VOICE_SAMPLES = 8;
/** Guards against an oversized or absurd embedding dimensionality. */
export const MAX_VOICE_DIMS = 2048;
/** Longest voice label (display name). */
export const MAX_VOICE_LABEL_LENGTH = 60;
/** How many distinct voices one user may enrol. */
export const MAX_VOICES_PER_USER = 10;

const voiceLabel = z.string().trim().min(1).max(MAX_VOICE_LABEL_LENGTH).meta({
  title: "Label",
  description: "The voice's display name (e.g. a person or device).",
  example: "Gui",
});

export const voiceProfileBody = z.object({
  label: voiceLabel,
  embeddings: z
    .array(z.array(z.number()).min(1).max(MAX_VOICE_DIMS))
    .min(MIN_VOICE_SAMPLES)
    .max(MAX_VOICE_SAMPLES)
    .meta({
      title: "Embeddings",
      description:
        "One L2-normalised speaker embedding per enrolment sample, extracted " +
        "by the client-side model. All must share the same length.",
    }),
  modelId: z.string().trim().min(1).max(200).meta({
    title: "Model ID",
    description: "Which client-side embedding model produced these embeddings.",
  }),
});

export type VoiceProfileBody = z.infer<typeof voiceProfileBody>;

/** Rename an enrolled voice. */
export const voiceLabelBody = z.object({ label: voiceLabel });

export type VoiceLabelBody = z.infer<typeof voiceLabelBody>;

/** The legacy single-profile enrolment (no label): it writes the default voice. */
export const legacyVoiceProfileBody = voiceProfileBody.omit({ label: true });

/**
 * The single voice profile of the legacy `/voice-profile` routes, still used
 * by the Android app: every enrolled voice of the most recently used model,
 * flattened, so a client that checks against it accepts any of them.
 */
export interface LegacyVoiceProfile {
  enrolled: boolean;
  embeddings: number[][];
  dims: number;
  modelId: string;
}

/** One of a user's enrolled wake-word voices (embeddings stay client-usable). */
export interface VoiceProfile {
  id: string;
  label: string;
  embeddings: number[][];
  dims: number;
  modelId: string;
}

/** One tool call the agent made while answering, shown as a chip in the UI. */
export interface AssistantAction {
  tool: string;
  ok: boolean;
  summary: string;
}

export interface ChatReply {
  conversationId: string;
  reply: string;
  actions: AssistantAction[];
  /** Images generated or captured (cameras) while answering. */
  images: ImageView[];
  /** The user said goodbye: speak the reply, then stop listening. */
  endConversation: boolean;
}

/**
 * Events of `POST /api/assistant/chat/stream`, one per SSE `data:` line, in
 * order: conversation, then any tool/action/image/delta, then done (or error).
 */
export type StreamEvent =
  | { type: "conversation"; conversationId: string }
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
  /** URL of the client-side speaker-embedding model, or null if not deployed. */
  voiceModelUrl: string | null;
  /** Which speaker-embedding model is deployed (invalidates old enrolments). */
  voiceModelId: string;
}
