import { describe, expect, test } from "bun:test";

const { consistencyScores, ENROLLMENT, recordVoice } = await import(
  "@public/components/VoiceAssistantContext/enrollment"
);
const { SPEECH_TRIM } = await import("@public/components/VoiceAssistantContext/speechTrim");
const { NoSpeechError } = await import("@public/components/VoiceAssistantContext/transcriber");

type Captured = { samples: Float32Array; sampleRate: number };
type Step = Parameters<Parameters<typeof recordVoice>[2]>[0];

const RATE = 16000;
const ms = (value: number) => Math.round((value / 1000) * RATE);

/** Silence, `speechMs` of voice, silence: what one spoken sample looks like. */
function sample(speechMs = 600): Captured {
  const samples = new Float32Array(ms(300 + speechMs + 300));
  samples.fill(0.3, ms(300), ms(300 + speechMs));
  return { samples, sampleRate: RATE };
}
const silent = (): Captured => ({ samples: new Float32Array(ms(1500)), sampleRate: RATE });

const GUI = [1, 0];
const OTHER = [0, 1];

/**
 * Runs recordVoice against scripted recordings (or errors to throw) and
 * scripted embeddings, one per usable recording, in order.
 */
async function enrol(recordings: (Captured | Error)[], embeddings: number[][]) {
  const steps: Step[] = [];
  const embedded: number[] = [];
  const model = {
    embed: async (samples: Float32Array) => {
      embedded.push(samples.length);
      return Float32Array.from(embeddings.shift()!);
    },
  };
  const capture = async (timeoutMs: number) => {
    expect(timeoutMs).toBe(ENROLLMENT.silenceTimeoutMs);
    const next = recordings.shift()!;
    if (next instanceof Error) throw next;
    return next;
  };
  const result = recordVoice(model, capture, (step) => steps.push(step));
  return { result, steps, embedded };
}

const goodRun = () => Array.from({ length: ENROLLMENT.samples }, () => sample());
const same = (embedding: number[]) =>
  Array.from({ length: ENROLLMENT.samples }, () => embedding);

describe("recordVoice", () => {
  test("records each sample, embedding only its speech", async () => {
    const { result, steps, embedded } = await enrol(goodRun(), same(GUI));
    expect(await result).toEqual({ embeddings: same(GUI), consistency: 1 });
    expect(steps).toEqual(
      Array.from({ length: ENROLLMENT.samples }, (_, i) => ({
        kind: "record",
        sample: i + 1,
        total: ENROLLMENT.samples,
      })),
    );
    // 600 ms of speech plus the padding, not the 1.2 s recording.
    const padded = ms(600) + 2 * ms(SPEECH_TRIM.padMs);
    expect(embedded).toEqual(Array(ENROLLMENT.samples).fill(padded));
  });

  test("asks again after silence, a clipped word or nobody speaking", async () => {
    const recordings = [silent(), sample(100), new NoSpeechError(), ...goodRun()];
    const { result, steps } = await enrol(recordings, same(GUI));
    expect((await result).embeddings).toHaveLength(ENROLLMENT.samples);
    expect(steps.slice(0, 4)).toEqual([
      { kind: "record", sample: 1, total: ENROLLMENT.samples },
      { kind: "retry" },
      { kind: "retry" },
      { kind: "retry" },
    ]);
  });

  test("gives up after too many unusable recordings", async () => {
    const recordings = Array.from({ length: ENROLLMENT.maxRetries + 1 }, silent);
    const { result } = await enrol(recordings, []);
    await expect(result).rejects.toThrow("Não consegui ouvir você direito");
  });

  test("passes other failures through, such as a denied microphone", async () => {
    const { result } = await enrol([new Error("Permission denied")], []);
    await expect(result).rejects.toThrow("Permission denied");
  });

  test("records again the sample that does not sound like the others", async () => {
    const recordings = [...goodRun(), sample()];
    const { result, steps } = await enrol(recordings, [GUI, GUI, OTHER, GUI, GUI]);
    expect(await result).toEqual({ embeddings: same(GUI), consistency: 1 });
    expect(steps.at(-1)).toEqual({ kind: "redo" });
  });

  test("gives up when the samples keep disagreeing", async () => {
    // Every recording, re-recordings included, is a different voice
    // (orthogonal embeddings), so no replacement ever makes them agree.
    const count = ENROLLMENT.samples + ENROLLMENT.maxRedos;
    const voices = Array.from({ length: count }, (_, i) =>
      Array.from({ length: count }, (_, j) => (i === j ? 1 : 0)),
    );
    const recordings = Array.from({ length: count }, () => sample());
    const { result, steps } = await enrol(recordings, voices);
    await expect(result).rejects.toThrow("As gravações ficaram muito diferentes entre si");
    expect(steps.filter((step) => step.kind === "redo")).toHaveLength(ENROLLMENT.maxRedos);
  });
});

describe("consistencyScores", () => {
  test("averages each embedding's similarity to the others", () => {
    expect(consistencyScores([GUI, GUI, OTHER])).toEqual([0.5, 0.5, 0]);
  });

  test("a single sample is trivially consistent", () => {
    expect(consistencyScores([GUI])).toEqual([1]);
    expect(consistencyScores([])).toEqual([]);
  });
});
