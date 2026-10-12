import type { InstrumentedInit } from "@server/instrumentation/instrumentFetch";
import { withSpan } from "@server/instrumentation/withSpan";
import safeEnvGet from "@server/safeEnvGet";

import { SpanKind, trace } from "@opentelemetry/api";

import { toSpeakable } from "./speakable";

const tracer = trace.getTracer("assistant");

export const OPENROUTER_AUDIO_URL = "https://openrouter.ai/api/v1/audio";
/** ElevenLabs Scribe v2, through OpenRouter. Detects Portuguese on its own. */
export const STT_MODEL = "elevenlabs/scribe-v2";
/**
 * Microsoft MAI Voice through OpenRouter: it has native Brazilian voices, while
 * OpenRouter's ElevenLabs voices are English voices that sound European when
 * speaking Portuguese. Override with ASSISTANT_TTS_MODEL.
 */
export const DEFAULT_TTS_MODEL = "microsoft/mai-voice-2.1-flash";
/** A pt-BR voice of the default model; voices are model-specific (ASSISTANT_VOICE). */
export const DEFAULT_VOICE = "pt-BR-Luana:MAI-Voice-2.1-Flash";
/** Delivery guidance for models that take it (OpenAI, Gemini); others ignore it. */
export const TTS_INSTRUCTIONS =
  "Fale em português do Brasil, com sotaque brasileiro natural e tom amigável.";

/**
 * ElevenLabs' own API, used for the assistant's voice when ELEVENLABS_API_KEY
 * and ELEVENLABS_VOICE_ID are set. Unlike OpenRouter's ElevenLabs (English
 * voices only), it reaches the Voice Library's native Brazilian voices; pick
 * one with `bun run assistant:voices`.
 */
export const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";
/**
 * Its most natural multilingual model, and the API's default. Replies are
 * synthesised whole before they play; for faster answers at some cost in
 * quality, set ELEVENLABS_TTS_MODEL=eleven_flash_v2_5.
 */
export const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";
/** mp3, like the OpenRouter voices, so every client decodes it the same way. */
export const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";

const OPENROUTER_ATTRS = { "peer.service": "openrouter" } as const;

function headers() {
  return {
    Authorization: `Bearer ${safeEnvGet("OPEN_ROUTER_API_KEY")}`,
    "Content-Type": "application/json",
  };
}

async function ensureOk(response: Response, provider = "OpenRouter"): Promise<Response> {
  if (!response.ok) {
    throw new Error(
      `${provider} audio request failed: ${response.status} ${await response.text()}`,
    );
  }
  return response;
}

interface ElevenLabsVoice {
  apiKey: string;
  voiceId: string;
  model: string;
}

/** The ElevenLabs voice to speak with, or null to keep the OpenRouter voice. */
function elevenLabsVoice(): ElevenLabsVoice | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) return null;
  return {
    apiKey,
    voiceId,
    model: process.env.ELEVENLABS_TTS_MODEL || DEFAULT_ELEVENLABS_MODEL,
  };
}

/** The request body; `language_code` pins Portuguese where the model takes it. */
export function elevenLabsBody(text: string, model: string): Record<string, unknown> {
  // The API documents language_code as unsupported by multilingual_v2 (it
  // detects the language from the text); the flash/turbo/v3 models take it.
  return model.startsWith("eleven_multilingual_v2")
    ? { text, model_id: model }
    : { text, model_id: model, language_code: "pt" };
}

export abstract class AudioService {
  // explicit ctor: bun cannot count an implicit one as covered
  constructor() {}

  /** Transcribes one recorded utterance (a WAV file) to text. */
  static transcribe(wav: Uint8Array): Promise<string> {
    return withSpan(
      tracer,
      "assistant.stt",
      {
        kind: SpanKind.CLIENT,
        attributes: {
          ...OPENROUTER_ATTRS,
          "assistant.stt.model": STT_MODEL,
          "assistant.stt.bytes": wav.byteLength,
        },
      },
      async () => {
        const response = await ensureOk(
          await fetch(`${OPENROUTER_AUDIO_URL}/transcriptions`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              model: STT_MODEL,
              input_audio: {
                data: Buffer.from(wav).toString("base64"),
                format: "wav",
              },
            }),
          }),
        );
        const { text } = (await response.json()) as { text?: string };
        return (text ?? "").trim();
      },
    );
  }

  /**
   * Starts speech synthesis and returns the mp3 response unread. The automatic
   * fetch instrumentation is skipped because it would buffer the whole body.
   * Speaks with ElevenLabs when it is configured, else through OpenRouter.
   */
  static speech(markdown: string): Promise<Response> {
    // Replies are markdown for the chat; the voice reads plain sentences.
    const text = toSpeakable(markdown) || markdown;
    const eleven = elevenLabsVoice();
    return eleven ? AudioService.elevenLabsSpeech(text, eleven) : AudioService.openRouterSpeech(text);
  }

  private static elevenLabsSpeech(text: string, voice: ElevenLabsVoice): Promise<Response> {
    return withSpan(
      tracer,
      "assistant.tts",
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "peer.service": "elevenlabs",
          "assistant.tts.provider": "elevenlabs",
          "assistant.tts.model": voice.model,
          "assistant.tts.voice": voice.voiceId,
          "assistant.tts.characters": text.length,
        },
      },
      async () => {
        const url =
          `${ELEVENLABS_API_URL}/text-to-speech/${encodeURIComponent(voice.voiceId)}` +
          `/stream?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;
        const init: InstrumentedInit = {
          method: "POST",
          headers: {
            "xi-api-key": voice.apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify(elevenLabsBody(text, voice.model)),
          skipInstrumentation: true,
        };
        return ensureOk(await fetch(url, init), "ElevenLabs");
      },
    );
  }

  private static openRouterSpeech(text: string): Promise<Response> {
    const model = process.env.ASSISTANT_TTS_MODEL || DEFAULT_TTS_MODEL;
    const voice = process.env.ASSISTANT_VOICE || DEFAULT_VOICE;
    return withSpan(
      tracer,
      "assistant.tts",
      {
        kind: SpanKind.CLIENT,
        attributes: {
          ...OPENROUTER_ATTRS,
          "assistant.tts.provider": "openrouter",
          "assistant.tts.model": model,
          "assistant.tts.voice": voice,
          "assistant.tts.characters": text.length,
        },
      },
      async () => {
        const init: InstrumentedInit = {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            model,
            input: text,
            voice,
            instructions: TTS_INSTRUCTIONS,
            response_format: "mp3",
          }),
          skipInstrumentation: true,
        };
        return ensureOk(await fetch(`${OPENROUTER_AUDIO_URL}/speech`, init));
      },
    );
  }
}
