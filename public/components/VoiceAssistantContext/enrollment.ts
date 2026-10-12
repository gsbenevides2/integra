import { cosine, type SpeakerModel } from "./speakerModel";
import { lastSpeech } from "./speechTrim";
import { type Captured, NoSpeechError } from "./transcriber";

/** How a voice is recorded: how many samples, and what makes one usable. */
export const ENROLLMENT = {
  /** "Ei Integra" samples kept per voice. */
  samples: 4,
  /** How long to wait for each sample to start. */
  silenceTimeoutMs: 8000,
  /** Less voiced audio than this is a cough or a clipped word, not the phrase. */
  minVoicedMs: 300,
  /** Unusable recordings (nothing heard, too short) tolerated before giving up. */
  maxRetries: 4,
  /**
   * Each sample's average similarity to the others must reach this. Below it
   * the sample is likely noise, another voice or a very different delivery,
   * and it is recorded again. Same-voice samples usually score well above it.
   */
  minConsistency: 0.45,
  /** Inconsistent samples re-recorded before giving up. */
  maxRedos: 2,
};

/** What the person should do now, for the progress message. */
export type EnrollmentStep =
  /** Say the phrase: sample `sample` of `total`. */
  | { kind: "record"; sample: number; total: number }
  /** The last recording was unusable: say it again. */
  | { kind: "retry" }
  /** One sample did not match the others: say it once more. */
  | { kind: "redo" };

export interface RecordedVoice {
  /** One L2-normalised embedding per kept sample. */
  embeddings: number[][];
  /**
   * Average similarity between the samples (cosine, 0..1). It is roughly what
   * this voice will score at the wake word, so it is compared to the threshold.
   */
  consistency: number;
}

/** Each embedding's average cosine similarity to all the others. */
export function consistencyScores(embeddings: ArrayLike<number>[]): number[] {
  if (embeddings.length < 2) return embeddings.map(() => 1);
  return embeddings.map((embedding, i) => {
    let sum = 0;
    embeddings.forEach((other, j) => {
      if (i !== j) sum += cosine(embedding, other);
    });
    return sum / (embeddings.length - 1);
  });
}

/**
 * Records a voice: ENROLLMENT.samples spoken "Ei Integra", each trimmed to its
 * speech and embedded locally. A recording with no speech, or too little, is
 * asked for again; a sample that does not sound like the rest is replaced.
 * Rejects with a message for the person when it cannot get a usable voice,
 * and with any other error (e.g. the microphone) as is.
 */
export async function recordVoice(
  model: SpeakerModel,
  capture: (silenceTimeoutMs: number) => Promise<Captured>,
  onStep: (step: EnrollmentStep) => void,
): Promise<RecordedVoice> {
  let retries = 0;
  const recordOne = async (step: EnrollmentStep): Promise<number[]> => {
    onStep(step);
    for (;;) {
      try {
        const { samples, sampleRate } = await capture(ENROLLMENT.silenceTimeoutMs);
        const speech = lastSpeech(samples, sampleRate);
        if (speech && speech.voicedMs >= ENROLLMENT.minVoicedMs) {
          return Array.from(await model.embed(speech.samples, sampleRate));
        }
      } catch (error) {
        if (!(error instanceof NoSpeechError)) throw error;
      }
      if (++retries > ENROLLMENT.maxRetries) {
        throw new Error(
          "Não consegui ouvir você direito. Tente de novo num lugar mais silencioso.",
        );
      }
      onStep({ kind: "retry" });
    }
  };

  const embeddings: number[][] = [];
  for (let i = 0; i < ENROLLMENT.samples; i++) {
    embeddings.push(
      await recordOne({ kind: "record", sample: i + 1, total: ENROLLMENT.samples }),
    );
  }

  let scores = consistencyScores(embeddings);
  for (let redos = 0; Math.min(...scores) < ENROLLMENT.minConsistency; redos++) {
    if (redos >= ENROLLMENT.maxRedos) {
      throw new Error(
        "As gravações ficaram muito diferentes entre si. Tente de novo num lugar " +
          "silencioso, falando sempre do mesmo jeito.",
      );
    }
    const worst = scores.indexOf(Math.min(...scores));
    embeddings[worst] = await recordOne({ kind: "redo" });
    scores = consistencyScores(embeddings);
  }
  const consistency = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return { embeddings, consistency };
}
