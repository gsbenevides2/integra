import {
  AudioService,
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VOICE,
  ELEVENLABS_API_URL,
  ELEVENLABS_OUTPUT_FORMAT,
  elevenLabsBody,
  STT_MODEL,
  TTS_INSTRUCTIONS,
} from "@server/modules/assistant/service/audio";

import { afterAll, afterEach, describe, expect, test } from "bun:test";

import { provideEnv } from "./helpers";

afterAll(provideEnv(["OPEN_ROUTER_API_KEY"]));

const realFetch = globalThis.fetch;
const calls: { url: string; init: RequestInit }[] = [];
function respond(response: Response) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as typeof fetch;
}
const ELEVENLABS_ENV = ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_TTS_MODEL"];
afterEach(() => {
  globalThis.fetch = realFetch;
  calls.length = 0;
  delete process.env.ASSISTANT_VOICE;
  delete process.env.ASSISTANT_TTS_MODEL;
  for (const key of ELEVENLABS_ENV) delete process.env[key];
});

describe("AudioService", () => {
  test("transcribe sends the WAV to Scribe through OpenRouter", async () => {
    new (AudioService as unknown as new () => object)();
    respond(Response.json({ text: " liga a luz " }));
    expect(await AudioService.transcribe(new Uint8Array([1, 2, 3]))).toBe("liga a luz");
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe("Bearer x");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      model: STT_MODEL,
      input_audio: { data: "AQID", format: "wav" },
    });

    respond(Response.json({}));
    expect(await AudioService.transcribe(new Uint8Array([1]))).toBe("");
  });

  test("speech reads markdown replies as plain sentences", async () => {
    respond(new Response("mp3"));
    await AudioService.speech("Liguei a **luz** e:\n- a sala\n- o quarto");
    expect(JSON.parse(calls[0]!.init.body as string).input).toBe("Liguei a luz e: a sala. o quarto");

    // Nothing speakable left (e.g. only an image): send the original.
    respond(new Response("mp3"));
    await AudioService.speech("![x](https://x/y.png)");
    expect(JSON.parse(calls[1]!.init.body as string).input).toBe("![x](https://x/y.png)");
  });

  test("failures carry the upstream status and body", async () => {
    respond(new Response("no credits", { status: 402 }));
    await expect(AudioService.transcribe(new Uint8Array([1]))).rejects.toThrow(
      "OpenRouter audio request failed: 402 no credits",
    );
    respond(new Response("down", { status: 502 }));
    await expect(AudioService.speech("oi")).rejects.toThrow("502 down");
  });

  test("speech asks for Brazilian mp3 in the configured model and voice", async () => {
    respond(new Response("mp3"));
    const response = await AudioService.speech("Olá");
    expect(await response.text()).toBe("mp3");
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      model: DEFAULT_TTS_MODEL,
      input: "Olá",
      voice: DEFAULT_VOICE,
      instructions: TTS_INSTRUCTIONS,
      response_format: "mp3",
    });
    expect(DEFAULT_VOICE.startsWith("pt-BR-")).toBe(true);

    process.env.ASSISTANT_TTS_MODEL = "elevenlabs/eleven-flash-v2.5";
    process.env.ASSISTANT_VOICE = "george";
    respond(new Response("mp3"));
    await AudioService.speech("Oi");
    expect(JSON.parse(calls[1]!.init.body as string)).toMatchObject({
      model: "elevenlabs/eleven-flash-v2.5",
      voice: "george",
    });
  });
});

describe("AudioService with ElevenLabs", () => {
  const useElevenLabs = (model?: string) => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    process.env.ELEVENLABS_VOICE_ID = "GM2UA3fbsIaLHcswCDX9";
    if (model) process.env.ELEVENLABS_TTS_MODEL = model;
  };

  test("speaks with the configured voice, as plain sentences, in mp3", async () => {
    useElevenLabs();
    respond(new Response("mp3"));
    const response = await AudioService.speech("Liguei a **luz**.");
    expect(await response.text()).toBe("mp3");
    expect(calls[0]?.url).toBe(
      `${ELEVENLABS_API_URL}/text-to-speech/GM2UA3fbsIaLHcswCDX9/stream` +
        `?output_format=${ELEVENLABS_OUTPUT_FORMAT}`,
    );
    expect(calls[0]?.init.headers).toEqual({
      "xi-api-key": "sk_test",
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    });
    // multilingual_v2 takes no language_code: it detects Portuguese itself.
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      text: "Liguei a luz.",
      model_id: DEFAULT_ELEVENLABS_MODEL,
    });
  });

  test("pins Portuguese for the models that take a language code", async () => {
    useElevenLabs("eleven_flash_v2_5");
    respond(new Response("mp3"));
    await AudioService.speech("Oi");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      text: "Oi",
      model_id: "eleven_flash_v2_5",
      language_code: "pt",
    });
    expect(elevenLabsBody("Oi", "eleven_multilingual_v2")).toEqual({
      text: "Oi",
      model_id: "eleven_multilingual_v2",
    });
  });

  test("keeps the OpenRouter voice until a voice is chosen too", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    respond(new Response("mp3"));
    await AudioService.speech("Oi");
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/audio/speech");
  });

  test("failures name ElevenLabs and carry its status and body", async () => {
    useElevenLabs();
    respond(new Response("missing permission", { status: 401 }));
    await expect(AudioService.speech("oi")).rejects.toThrow(
      "ElevenLabs audio request failed: 401 missing permission",
    );
  });
});
