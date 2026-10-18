import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { installVoiceFakes, voice } from "../../../helpers/voice";

afterAll(installVoiceFakes());

const { startWakeWord, WAKE_COOLDOWN_MS } = await import(
  "@public/components/VoiceAssistantContext/wakeWord"
);

beforeEach(() => voice.reset());

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

describe("startWakeWord", () => {
  test("fires on a wake phrase, once per cooldown, and ignores other speech", async () => {
    let clock = 0;
    const now = spyOn(performance, "now").mockImplementation(() => clock);
    let detections = 0;
    const engine = await startWakeWord(() => detections++);
    const recognizer = voice.recognizers.at(-1)!;

    clock = WAKE_COOLDOWN_MS;
    recognizer.result("ei integra");
    expect(detections).toBe(1);
    clock += 1;
    recognizer.result("integra"); // inside the cooldown
    recognizer.result("bom dia"); // not a wake phrase
    expect(detections).toBe(1);
    clock += WAKE_COOLDOWN_MS;
    recognizer.result("integra");
    expect(detections).toBe(2);

    await engine.stop();
    expect(recognizer.removed).toBe(true);
    now.mockRestore();
  });
});
