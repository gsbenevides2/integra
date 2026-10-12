import { getLogger, logError, logWarn } from "@server/instrumentation/instrumentLogger";
import { authz, currentUser } from "@server/shared/authz";

import Elysia, { status } from "elysia";

import {
  type AssistantConfig,
  type ChatBody,
  chatBody,
  type ConversationDetail,
  type ConversationSummary,
  MAX_AUDIO_BYTES,
  type MessageView,
  settingsBody,
  type StreamEvent,
  ttsBody,
} from "./model";
import { AssistantAgent, type ChatRequest } from "./service/agent";
import { AudioService } from "./service/audio";
import { type Conversation, ConversationService } from "./service/conversation";
import { IMAGE_EXTENSIONS, ImageStorage, MAX_IMAGE_BYTES } from "./service/images";
import { AssistantSettingsService } from "./service/settings";

/** The Portuguese Vosk model; wake word detection is off until it is downloaded. */
export const VOSK_MODEL_FILE = "public/vosk/vosk-model-small-pt.tar.gz";

const log = getLogger("assistant");

/** The agent request for a chat body, or null if an image is not the user's. */
function toChatRequest(userId: string, body: ChatBody): ChatRequest | null {
  const keys = body.images ?? [];
  if (keys.some((key) => !ImageStorage.owns(userId, key))) return null;
  return {
    text: body.text,
    conversationId: body.conversationId,
    uploads: keys.map((key) => ImageStorage.fromUploadKey(key)),
  };
}

function toSummary(conversation: Conversation): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    ended: conversation.endedAt !== null,
  };
}

export const assistantRoutes = new Elysia({
  prefix: "/api/assistant",
  detail: { tags: ["Assistant"] },
})
  .use(authz)
  .get(
    "/config",
    async (): Promise<AssistantConfig> => ({
      wakeWordEnabled: await Bun.file(VOSK_MODEL_FILE).exists(),
    }),
    {
      detail: {
        summary: "Assistant Config",
        description:
          "Browser-side settings for the voice assistant: whether the " +
          "offline wake word model is deployed.",
      },
    },
  )
  .post(
    "/stt",
    async ({ request }) => {
      const audio = new Uint8Array(await request.arrayBuffer());
      if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
        return status(400, { error: "Invalid audio size" });
      }
      return { text: await AudioService.transcribe(audio) };
    },
    {
      parse: "none",
      detail: {
        summary: "Speech-to-Text",
        description:
          "Transcribes one recorded utterance (a WAV body) with ElevenLabs " +
          "Scribe through OpenRouter.",
      },
    },
  )
  .post(
    "/uploads",
    async (ctx) => {
      const mediaType = ctx.request.headers.get("content-type")?.split(";")[0] ?? "";
      if (!(mediaType in IMAGE_EXTENSIONS)) {
        return status(415, { error: "Unsupported image type" });
      }
      const bytes = new Uint8Array(await ctx.request.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
        return status(400, { error: "Invalid image size" });
      }
      const image = await ImageStorage.save(currentUser(ctx).id, bytes, mediaType, "upload");
      return ImageStorage.view(image);
    },
    {
      parse: "none",
      detail: {
        summary: "Upload Image",
        description:
          "Stores an image (raw JPEG/PNG/WebP/GIF body) in the private bucket " +
          "so it can be attached to the next chat message.",
      },
    },
  )
  .post(
    "/chat",
    (ctx) => {
      const user = currentUser(ctx);
      const request = toChatRequest(user.id, ctx.body);
      if (!request) return status(403, { error: "Image not found" });
      return AssistantAgent.run(user, request);
    },
    {
      detail: {
        summary: "Talk to the Assistant",
        description:
          "Sends one user utterance (optionally with uploaded images) to the AI " +
          "agent, which may call tools on the user's behalf (respecting their " +
          "permissions), and returns the spoken reply, the actions it took and " +
          "any images it generated or captured.",
      },
      body: chatBody,
    },
  )
  .post(
    "/chat/stream",
    (ctx) => {
      const user = currentUser(ctx);
      const request = toChatRequest(user.id, ctx.body);
      if (!request) return status(403, { error: "Image not found" });
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: StreamEvent) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          try {
            await AssistantAgent.run(user, request, send);
          } catch (error) {
            logError(log, "[assistant] streamed chat failed", {
              "error.message": error instanceof Error ? error.message : String(error),
            });
            send({ type: "error", message: "O assistente não respondeu" });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          // Stops reverse proxies (nginx-style) from buffering the stream.
          "x-accel-buffering": "no",
        },
      });
    },
    {
      detail: {
        summary: "Talk to the Assistant (streaming)",
        description:
          "Same as POST /api/assistant/chat, but answers with Server-Sent " +
          "Events: the conversation id, each tool as it starts, actions, " +
          "images, the reply text as it is written, and finally the full reply.",
      },
      body: chatBody,
    },
  )
  .delete(
    "/conversation",
    async (ctx) => {
      await ConversationService.endAll(currentUser(ctx).id);
      return { ok: true };
    },
    {
      detail: {
        summary: "Start a New Conversation",
        description:
          "Closes the user's open conversation, so the next message starts a " +
          "new one. History is kept.",
      },
    },
  )
  .get(
    "/conversations",
    async (ctx): Promise<ConversationSummary[]> =>
      (await ConversationService.list(currentUser(ctx).id)).map(toSummary),
    {
      detail: {
        summary: "List Conversations",
        description: "The user's conversation history, most recent first.",
      },
    },
  )
  .get(
    "/conversations/:id",
    async (ctx) => {
      const conversation = await ConversationService.find(
        currentUser(ctx).id,
        ctx.params.id,
      );
      if (!conversation) return status(404, { error: "Conversation not found" });
      const messages = await ConversationService.messages(conversation.id);
      return {
        ...toSummary(conversation),
        messages: messages.map(
          (message): MessageView => ({
            id: message.id,
            role: message.role,
            text: message.text,
            actions: message.actions,
            images: message.images.map((image) => ImageStorage.view(image)),
            createdAt: message.createdAt,
          }),
        ),
      } satisfies ConversationDetail;
    },
    {
      detail: {
        summary: "Get Conversation",
        description:
          "One of the user's conversations with its messages; image URLs " +
          "point at GET /api/assistant/images/*.",
      },
    },
  )
  .delete(
    "/conversations/:id",
    async (ctx) => {
      const images = await ConversationService.remove(currentUser(ctx).id, ctx.params.id);
      if (!images) return status(404, { error: "Conversation not found" });
      // The conversation is gone either way; images left behind are swept daily.
      await ImageStorage.remove(images).catch((error: unknown) =>
        logWarn(log, "[assistant] could not delete conversation images", {
          "error.message": error instanceof Error ? error.message : String(error),
        }),
      );
      return { ok: true };
    },
    {
      detail: {
        summary: "Delete Conversation",
        description: "Deletes one of the user's conversations and its images.",
      },
    },
  )
  .get(
    "/images/*",
    (ctx) => {
      const key = ImageStorage.keyFromRoute(ctx.params["*"]);
      if (!ImageStorage.owns(currentUser(ctx).id, key)) {
        return status(404, { error: "Image not found" });
      }
      return new Response(null, {
        status: 302,
        headers: {
          location: ImageStorage.signedUrl(key),
          // Shorter than the signed URL's lifetime, so a cached hop still works.
          "cache-control": "private, max-age=300",
        },
      });
    },
    {
      detail: {
        summary: "Get Assistant Image",
        description:
          "Redirects to a short-lived presigned URL for one of the user's " +
          "assistant images (uploaded, generated or camera snapshots).",
      },
    },
  )
  .get(
    "/settings",
    (ctx) => AssistantSettingsService.get(currentUser(ctx).id),
    {
      detail: {
        summary: "Get My Assistant Settings",
        description:
          "Returns the current user's own instructions for the assistant.",
      },
    },
  )
  .put(
    "/settings",
    (ctx) => AssistantSettingsService.update(currentUser(ctx).id, ctx.body),
    {
      detail: {
        summary: "Update My Assistant Settings",
        description:
          "Sets the current user's own instructions, added to the " +
          "assistant's system prompt only when they talk to it.",
      },
      body: settingsBody,
    },
  )
  .post(
    "/tts",
    async ({ body }) => {
      const upstream = await AudioService.speech(body.text);
      return new Response(upstream.body, {
        headers: {
          "content-type": "audio/mpeg",
          "cache-control": "no-store",
        },
      });
    },
    {
      detail: {
        summary: "Text-to-Speech",
        description:
          "Synthesises Portuguese speech for the given text with ElevenLabs " +
          "through OpenRouter and streams it back as mp3.",
      },
      body: ttsBody,
    },
  );

const VOSK_DIST = "node_modules/@lichess-org/vosk-browser/dist";

/**
 * The Vosk worker and WASM runtime, served from the installed package so they
 * always match its version. They are public library code, outside /api.
 */
export const voskAssetRoutes = new Elysia({
  detail: { tags: ["FrontEnd"], hide: true },
})
  .get(
    "/vosk/vosk.worker.js",
    () =>
      new Response(Bun.file(`${VOSK_DIST}/vosk.worker.js`), {
        headers: { "content-type": "text/javascript" },
      }),
  )
  .get(
    "/vosk/vosk.wasm",
    () =>
      new Response(Bun.file(`${VOSK_DIST}/vosk.wasm`), {
        headers: { "content-type": "application/wasm" },
      }),
  );
