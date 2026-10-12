import { describe, expect, test } from "bun:test";

const { lastSpeech, SPEECH_TRIM } = await import(
  "@public/components/VoiceAssistantContext/speechTrim"
);

const RATE = 16000;
const ms = (value: number) => Math.round((value / 1000) * RATE);
const PAD = ms(SPEECH_TRIM.padMs);

/** A recording made of [amplitude, milliseconds] stretches. */
function recording(...parts: [number, number][]): Float32Array {
  const out = new Float32Array(parts.reduce((n, [, length]) => n + ms(length), 0));
  let offset = 0;
  for (const [level, length] of parts) {
    out.fill(level, offset, offset + ms(length));
    offset += ms(length);
  }
  return out;
}

describe("lastSpeech", () => {
  test("finds nothing in an empty, too short or silent recording", () => {
    expect(lastSpeech(new Float32Array(0), RATE)).toBeNull();
    expect(lastSpeech(new Float32Array(10), RATE)).toBeNull();
    expect(lastSpeech(recording([0, 2000]), RATE)).toBeNull();
    // Quiet enough to stay under the floor of the speech threshold.
    expect(lastSpeech(recording([0.005, 2000]), RATE)).toBeNull();
  });

  test("cuts the speech out of the silence, with padding on both sides", () => {
    const audio = recording([0, 1000], [0.3, 800], [0, 1000]);
    const speech = lastSpeech(audio, RATE)!;
    expect(speech.voicedMs).toBe(800);
    expect(speech.samples.length).toBe(ms(800) + 2 * PAD);
    expect(speech.samples[PAD]).toBeCloseTo(0.3);
    expect(speech.samples[0]).toBe(0);
  });

  test('keeps the short pause in "Ei … Integra" inside one utterance', () => {
    const audio = recording([0, 1000], [0.3, 200], [0, 200], [0.3, 500], [0, 1000]);
    const speech = lastSpeech(audio, RATE)!;
    expect(speech.voicedMs).toBe(700);
    expect(speech.samples.length).toBe(ms(900) + 2 * PAD);
  });

  test("returns only the last utterance when a long pause separates them", () => {
    const audio = recording([0, 500], [0.3, 1000], [0, 1500], [0.4, 600], [0, 500]);
    const speech = lastSpeech(audio, RATE)!;
    expect(speech.voicedMs).toBe(600);
    expect(speech.samples[PAD]).toBeCloseTo(0.4);
  });

  test("stands out from steady background noise", () => {
    const audio = recording([0.05, 1500], [0.4, 700], [0.05, 1500]);
    const speech = lastSpeech(audio, RATE)!;
    expect(speech.voicedMs).toBe(700);
  });

  test("clamps the padding at the edges of the recording", () => {
    const audio = recording([0.3, 600], [0, 1000], [0.3, 400]);
    // The last utterance runs to the very end: no padding after it.
    const tail = lastSpeech(audio, RATE)!;
    expect(tail.samples.length).toBe(ms(400) + PAD);

    const atStart = lastSpeech(recording([0.3, 600], [0, 2000]), RATE)!;
    expect(atStart.samples.length).toBe(ms(600) + PAD);
  });
});
