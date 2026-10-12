import { VAD } from "./transcriber";

/**
 * Finds the speech inside a recording, so the speaker model embeds the voice
 * and not the silence or room noise around it. Both enrolment samples and the
 * wake-word check go through this, so the two compare like with like: silence
 * also skews the fbank's cepstral mean normalisation toward the room.
 */
export const SPEECH_TRIM = {
  /** Analysis frame for the energy envelope. */
  frameMs: 20,
  /** Pauses up to this long stay in one utterance (the gap in "Ei … Integra"). */
  maxGapMs: 400,
  /** Audio kept on each side of the speech, so onsets and tails are not clipped. */
  padMs: 120,
  /** This quantile of the frame energies is taken as the background noise. */
  noiseQuantile: 0.2,
};

export interface SpeechSegment {
  /** The speech with its padding, copied out of the recording. */
  samples: Float32Array;
  /** How much of it is voiced, in milliseconds (pauses excluded). */
  voicedMs: number;
}

/**
 * The last stretch of speech in `samples`, with pauses shorter than
 * SPEECH_TRIM.maxGapMs merged into it, or null when nothing is louder than the
 * noise. The last one because, for the wake word, that is the phrase that was
 * just recognised; an enrolment sample holds a single utterance anyway.
 */
export function lastSpeech(samples: Float32Array, sampleRate: number): SpeechSegment | null {
  const frame = Math.max(1, Math.round((SPEECH_TRIM.frameMs / 1000) * sampleRate));
  const frames = Math.floor(samples.length / frame);
  if (frames === 0) return null;

  const levels = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i]! * samples[i]!;
    levels[f] = Math.sqrt(sum / frame);
  }
  const sorted = Float32Array.from(levels).sort();
  const noise = sorted[Math.floor((frames - 1) * SPEECH_TRIM.noiseQuantile)]!;
  const threshold = Math.max(VAD.minThreshold, noise * VAD.noiseFactor);

  let end = frames - 1;
  while (end >= 0 && levels[end]! <= threshold) end--;
  if (end < 0) return null;

  const maxGap = Math.round(SPEECH_TRIM.maxGapMs / SPEECH_TRIM.frameMs);
  let start = end;
  let voiced = 0;
  let gap = 0;
  for (let f = end; f >= 0 && gap <= maxGap; f--) {
    if (levels[f]! > threshold) {
      start = f;
      voiced++;
      gap = 0;
    } else {
      gap++;
    }
  }

  const pad = Math.round((SPEECH_TRIM.padMs / 1000) * sampleRate);
  const from = Math.max(0, start * frame - pad);
  const to = Math.min(samples.length, (end + 1) * frame + pad);
  return {
    samples: samples.slice(from, to),
    voicedMs: (voiced * frame * 1000) / sampleRate,
  };
}
