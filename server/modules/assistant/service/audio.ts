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

const OPENROUTER_ATTRS = { "peer.service": "openrouter" } as const;

function headers() {
  return {
    Authorization: `Bearer ${safeEnvGet("OPEN_ROUTER_API_KEY")}`,
    "Content-Type": "application/json",
  };
}

async function ensureOk(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new Error(
      `OpenRouter audio request failed: ${response.status} ${await response.text()}`,
    );
  }
  return response;
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
   */
  static speech(markdown: string): Promise<Response> {
    // Replies are markdown for the chat; the voice reads plain sentences.
    const text = toSpeakable(markdown) || markdown;
    const model = process.env.ASSISTANT_TTS_MODEL || DEFAULT_TTS_MODEL;
    const voice = process.env.ASSISTANT_VOICE || DEFAULT_VOICE;
    return withSpan(
      tracer,
      "assistant.tts",
      {
        kind: SpanKind.CLIENT,
        attributes: {
          ...OPENROUTER_ATTRS,
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
