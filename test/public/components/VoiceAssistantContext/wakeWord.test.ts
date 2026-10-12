import * as speakerModel from "@public/components/VoiceAssistantContext/speakerModel";
import type { VoiceProfile } from "@public/components/VoiceAssistantContext/voiceProfile";

import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { installVoiceFakes, voice } from "../../../helpers/voice";

// No mock.module for the speaker model: Bun keeps module mocks for every later
// test file. Only loadSpeakerModel is spied, and restored after each test.
afterAll(installVoiceFakes());

const { buildSpeakerGate, SPEAKER_BUFFER_MS, startWakeWord, WAKE_COOLDOWN_MS } = await import(
  "@public/components/VoiceAssistantContext/wakeWord"
);

const profile = (id: string, modelId: string, embeddings: number[][]): VoiceProfile => ({
  id,
  label: id,
  embeddings,
  dims: embeddings[0]?.length ?? 0,
  modelId,
});

const spies: { mockRestore: () => void }[] = [];
beforeEach(() => voice.reset());
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

/** Lets queued microtasks (the async speaker check) settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("buildSpeakerGate", () => {
  const model = { embed: async () => new Float32Array([1, 0]) };

  test("returns null with no model url", async () => {
    expect(await buildSpeakerGate(null, "m1", [profile("v1", "m1", [[1]])], 0.6)).toBeNull();
  });

  test("returns null when no voice was enrolled with the current model", async () => {
    const load = spyOn(speakerModel, "loadSpeakerModel").mockResolvedValue(model);
    spies.push(load);
    expect(await buildSpeakerGate("/m", "m1", [], 0.6)).toBeNull();
    expect(await buildSpeakerGate("/m", "m1", [profile("v1", "old", [[1, 2]])], 0.6)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  test("flattens every enrolled voice of the current model into one gate", async () => {
    const load = spyOn(speakerModel, "loadSpeakerModel").mockResolvedValue(model);
    spies.push(load);
    const profiles = [
      profile("v1", "m1", [[1, 0], [0, 1]]),
      profile("v2", "m1", [[0.5, 0.5]]),
      profile("v3", "other", [[9, 9]]), // another model's voice is ignored
    ];
    const gate = await buildSpeakerGate("/m", "m1", profiles, 0.7);
    expect(gate).toEqual({ model, embeddings: [[1, 0], [0, 1], [0.5, 0.5]], threshold: 0.7 });
    expect(load).toHaveBeenCalledWith("/m", "m1");
  });

  test("falls back to no gate when the model fails to load", async () => {
    spies.push(spyOn(speakerModel, "loadSpeakerModel").mockRejectedValue(new Error("404")));
    expect(await buildSpeakerGate("/m", "m1", [profile("v1", "m1", [[1]])], 0.6)).toBeNull();
  });
});

describe("startWakeWord startup failures", () => {
  test("rejects when the Vosk model fails to load", async () => {
    voice.modelError = "404";
    await expect(startWakeWord(() => {})).rejects.toThrow("404");
    expect(voice.clients[0]!.terminated).toBe(true);
  });

  test("rejects and frees the model when the microphone is denied", async () => {
    voice.micDenied = true;
    await expect(startWakeWord(() => {})).rejects.toThrow("Permission denied");
    expect(voice.clients[0]!.terminated).toBe(true);
  });
});

describe("startWakeWord with a speaker gate", () => {
  /** A gate whose model hears `heard`; Gui and Ana are the enrolled voices. */
  function gateHearing(heard: () => Promise<Float32Array>) {
    return {
      model: { embed: heard },
      embeddings: [
        [1, 0], // Gui
        [0, 1], // Ana
      ],
      threshold: 0.8,
    };
  }

  async function start(gate: ReturnType<typeof gateHearing>) {
    let detections = 0;
    const engine = await startWakeWord(() => detections++, gate);
    const recognizer = voice.recognizers.at(-1)!;
    return { engine, recognizer, detections: () => detections };
  }

  test("fires for any enrolled voice and ignores other voices", async () => {
    let heard = new Float32Array([0, 1]); // Ana, the second enrolled voice
    const embed = async () => heard;
    // Past the cooldown for every detection below.
    let clock = 0;
    const now = spyOn(performance, "now").mockImplementation(() => (clock += WAKE_COOLDOWN_MS));
    spies.push(now);
    const { engine, recognizer, detections } = await start(gateHearing(embed));

    // More audio than the ring buffer holds, so it wraps around.
    voice.feed(0.2, SPEAKER_BUFFER_MS + 500);
    recognizer.result("ei integra");
    await settle();
    expect(detections()).toBe(1);

    heard = new Float32Array([0.6, -0.8]); // a stranger: below the threshold for both
    recognizer.result("integra");
    await settle();
    expect(detections()).toBe(1);

    await engine.stop();
    expect(recognizer.removed).toBe(true);
  });

  test("fires without a check when no audio was buffered yet", async () => {
    const embed = async () => new Float32Array([0, 0]);
    const { engine, recognizer, detections } = await start(gateHearing(embed));
    recognizer.result("ei integra");
    await settle();
    expect(detections()).toBe(1);
    await engine.stop();
  });

  test("ignores a phrase during a running check, and a failing check never fires", async () => {
    let finish: (value: Float32Array) => void = () => {};
    let calls = 0;
    const embed = () => {
      calls++;
      if (calls === 1) return new Promise<Float32Array>((resolve) => (finish = resolve));
      return Promise.reject(new Error("inference failed"));
    };
    let clock = 0;
    spies.push(spyOn(performance, "now").mockImplementation(() => (clock += WAKE_COOLDOWN_MS)));
    const { engine, recognizer, detections } = await start(gateHearing(embed));
    voice.feed(0.2, 300);

    recognizer.result("ei integra"); // starts the slow check
    recognizer.result("ei integra"); // ignored while it runs
    expect(calls).toBe(1);
    finish(new Float32Array([1, 0]));
    await settle();
    expect(detections()).toBe(1);

    recognizer.result("ei integra"); // this check throws
    await settle();
    expect(calls).toBe(2);
    expect(detections()).toBe(1);
    await engine.stop();
  });
});
