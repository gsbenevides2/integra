import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";
import { FAKE_SAMPLE_RATE, installVoiceFakes, voice } from "../../../helpers/voice";

afterAll(installVoiceFakes());

const { CHUNK_SIZE, openMicrophone, resumeAudio } = await import(
  "@public/components/VoiceAssistantContext/microphone"
);
const { playChime, speak } = await import("@public/components/VoiceAssistantContext/speaker");
const { listenOnce, VAD } = await import("@public/components/VoiceAssistantContext/transcriber");
const { downsample, encodeWav, WAV_SAMPLE_RATE } = await import(
  "@public/components/VoiceAssistantContext/wav"
);
const { isWakePhrase, MODEL_URL, startWakeWord, WAKE_PHRASES } = await import(
  "@public/components/VoiceAssistantContext/wakeWord"
);

let ttsOk = true;
let sttReply: unknown = { text: " liga a luz " };
const calls = useApi({
  "POST /api/assistant/tts": () => (ttsOk ? { audio: true } : fail(502)),
  "POST /api/assistant/stt": () => sttReply,
});

beforeEach(() => {
  voice.reset();
  ttsOk = true;
  sttReply = { text: " liga a luz " };
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await flush();
  expect(check()).toBe(true);
}

describe("microphone", () => {
  test("streams worklet chunks, and stop releases everything", async () => {
    const chunks: Float32Array[] = [];
    const mic = await openMicrophone((samples) => chunks.push(samples));
    expect(mic.sampleRate).toBe(FAKE_SAMPLE_RATE);
    voice.feed(0.1, 200);
    expect(chunks).toHaveLength(2);
    expect(CHUNK_SIZE).toBeGreaterThan(128);

    resumeAudio();
    expect(voice.contexts[0]?.resumed).toBe(1);

    await mic.stop();
    expect(voice.contexts[0]?.closed).toBe(true);
    expect(voice.tracksStopped).toBe(1);
  });

  test("listeners share one microphone, closed when the last one stops", async () => {
    const first: number[] = [];
    const second: number[] = [];
    const [a, b] = await Promise.all([
      openMicrophone((samples, rate) => first.push(rate)),
      openMicrophone((samples, rate) => second.push(rate)),
    ]);
    expect(voice.contexts).toHaveLength(1);
    voice.feed(0.1, 100);
    expect([first, second]).toEqual([[FAKE_SAMPLE_RATE], [FAKE_SAMPLE_RATE]]);

    await a.stop();
    await a.stop(); // twice is harmless
    expect(voice.contexts[0]?.closed).toBe(false);
    voice.feed(0.1, 100);
    expect([first.length, second.length]).toEqual([1, 2]);
    await b.stop();
    expect(voice.contexts[0]?.closed).toBe(true);

    // The next listener opens a fresh one.
    const c = await openMicrophone(() => {});
    expect(voice.contexts).toHaveLength(2);
    await c.stop();
  });

  test("releases the stream when the worklet cannot load", async () => {
    voice.workletFails = true;
    await expect(openMicrophone(() => {})).rejects.toThrow("worklet blocked");
    expect(voice.tracksStopped).toBe(1);
    expect(voice.contexts[0]?.closed).toBe(true);
  });
});

describe("wav", () => {
  test("downsample averages blocks, and leaves low rates alone", () => {
    expect([...downsample(new Float32Array([1, 3, 5, 7]), 32000, 16000)]).toEqual([2, 6]);
    const low = new Float32Array([1, 2]);
    expect(downsample(low, 8000, 16000)).toBe(low);
  });

  test("encodeWav writes a 16 kHz mono 16-bit PCM file", () => {
    const wav = encodeWav([new Float32Array([0, 1]), new Float32Array([-1, 2])], WAV_SAMPLE_RATE);
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe("WAVE");
    expect(view.getUint32(24, true)).toBe(WAV_SAMPLE_RATE);
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767]);
  });
});

describe("speak", () => {
  test("decodes the reply and resolves when playback ends", async () => {
    const speaking = speak("Olá");
    await until(() => voice.sources.some((s) => s.started));
    expect(calls.at(-1)?.body).toEqual({ text: "Olá" });
    voice.finishPlayback();
    await speaking.done;
  });

  test("stop silences playback, or skips it while still loading", async () => {
    const playing = speak("a");
    await until(() => voice.sources.some((s) => s.started));
    playing.stop();
    await playing.done;
    expect(voice.sources[0]?.stopped).toBe(true);
    expect(voice.sources[0]?.onended).toBeNull();

    const early = speak("b");
    early.stop();
    await early.done;
    await flush();
    expect(voice.sources).toHaveLength(1);
  });

  test("a failure after stop is not an error", async () => {
    voice.decodeFails = true;
    const speaking = speak("x");
    speaking.stop();
    await speaking.done;
  });

  test("rejects on server and decoding errors", async () => {
    ttsOk = false;
    await expect(speak("x").done).rejects.toThrow("Falha ao gerar a fala");
    ttsOk = true;
    voice.decodeFails = true;
    await expect(speak("x").done).rejects.toThrow("bad mp3");
  });

  test("wraps non-Error failures", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject("offline")) as never;
    try {
      await expect(speak("x").done).rejects.toThrow("offline");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("playChime plays two tones, and is silent without Web Audio", () => {
    playChime();
    expect(voice.tones).toBe(2);
    const shared = voice.contexts[0] as unknown as { createGain: () => unknown };
    const realGain = shared?.createGain;
    if (shared) {
      shared.createGain = () => {
        throw new Error("no audio");
      };
    }
    try {
      expect(() => playChime()).not.toThrow();
    } finally {
      if (shared) shared.createGain = realGain;
    }
  });
});

describe("listenOnce", () => {
  const listen = (silenceTimeoutMs = 3000) => {
    const phases: string[] = [];
    const listening = listenOnce({ onPhase: (p) => phases.push(p), silenceTimeoutMs });
    return { listening, phases };
  };

  test("records until silence, then transcribes the utterance", async () => {
    const { listening, phases } = listen();
    await until(() => voice.openTaps.length === 1);
    voice.feed(0.001, 300); // background noise
    voice.feed(0.3, 100); // a click: too short to count as speech
    voice.feed(0.001, 100);
    expect(phases).toEqual([]);
    voice.utter();
    expect(await listening.result).toBe("liga a luz");
    expect(phases).toEqual(["speech", "transcribing"]);
    const upload = calls.find((c) => c.path === "/api/assistant/stt");
    expect(new TextDecoder().decode((upload?.body as Uint8Array).subarray(0, 4))).toBe("RIFF");
    expect(voice.openTaps).toHaveLength(0);
  });

  test("resolves empty when nobody speaks before the timeout", async () => {
    const { listening, phases } = listen(500);
    await until(() => voice.openTaps.length === 1);
    voice.feed(0, 600);
    expect(await listening.result).toBe("");
    expect(phases).toEqual([]);
  });

  test("caps very long utterances", async () => {
    const { listening } = listen();
    await until(() => voice.openTaps.length === 1);
    voice.feed(0.3, VAD.maxUtteranceMs + 100);
    expect(await listening.result).toBe("liga a luz");
  });

  test("cancel resolves empty, before or after the microphone opened", async () => {
    const before = listen();
    before.listening.cancel();
    expect(await before.listening.result).toBe("");
    await until(() => voice.contexts.length === 1);
    await until(() => voice.contexts[0]!.closed);

    const after = listen();
    await until(() => voice.openTaps.length === 1);
    after.listening.cancel();
    expect(await after.listening.result).toBe("");
    voice.feed(0.3, 100); // ignored after cancel
    expect(calls.some((c) => c.path === "/api/assistant/stt")).toBe(false);
  });

  test("rejects when the microphone or transcription fails", async () => {
    voice.micDenied = true;
    await expect(listen().listening.result).rejects.toThrow("Permission denied");

    voice.micDenied = false;
    sttReply = fail(502);
    const failed = listen();
    await until(() => voice.openTaps.length === 1);
    voice.utter();
    await expect(failed.listening.result).rejects.toThrow("Falha na transcrição");
  });

  test("wraps non-Error microphone failures", async () => {
    const devices = navigator.mediaDevices as unknown as { getUserMedia: () => Promise<never> };
    const real = devices.getUserMedia;
    devices.getUserMedia = () => Promise.reject("nope");
    try {
      await expect(listen().listening.result).rejects.toThrow("nope");
    } finally {
      devices.getUserMedia = real;
    }
  });
});

describe("wake word", () => {
  test("isWakePhrase only accepts an exact final phrase", () => {
    expect(isWakePhrase(" ei integra ")).toBe(true);
    expect(isWakePhrase("integra")).toBe(true);
    expect(isWakePhrase("integra [unk]")).toBe(false);
    expect(isWakePhrase("[unk]")).toBe(false);
    expect(WAKE_PHRASES).not.toContain("hey integra");
  });

  test("loads the model, listens with the wake grammar and stops cleanly", async () => {
    let detected = 0;
    const engine = await startWakeWord(() => detected++);
    expect(voice.clients[0]?.options).toMatchObject({ modelUrl: MODEL_URL });
    const recognizer = voice.recognizers[0]!;
    expect(JSON.parse(recognizer.grammar!)).toEqual([...WAKE_PHRASES, "[unk]"]);

    voice.feed(0.1, 200);
    expect(recognizer.chunks).toBe(2);
    recognizer.result("integra [unk]");
    expect(detected).toBe(0);
    recognizer.result("ei integra");
    recognizer.result("ei integra"); // within the cooldown
    expect(detected).toBe(1);

    await engine.stop();
    expect(recognizer.removed).toBe(true);
    expect(voice.clients[0]?.terminated).toBe(true);
    expect(voice.openTaps).toHaveLength(0);
  });

  test("rejects when the model fails to load", async () => {
    voice.modelLoads = false;
    await expect(startWakeWord(() => {})).rejects.toThrow("Falha ao carregar o modelo de voz");
    voice.modelLoads = true;
    voice.modelError = "404";
    await expect(startWakeWord(() => {})).rejects.toThrow("404");
    expect(voice.clients.at(-1)?.terminated).toBe(true);
  });

  test("releases the model when the microphone is denied", async () => {
    voice.micDenied = true;
    await expect(startWakeWord(() => {})).rejects.toThrow("Permission denied");
    expect(voice.clients[0]?.terminated).toBe(true);
  });
});
