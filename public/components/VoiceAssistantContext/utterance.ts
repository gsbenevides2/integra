import { cosine } from "./speakerModel";
import { lastSpeech } from "./speechTrim";
import type { SpeakerGate } from "./wakeWord";

/**
 * Whether the voice in these samples matches an enrolled profile. The speech
 * is embedded alone (as enrolment does), falling back to the whole recording
 * when nothing stands out from the noise.
 */
export async function matchesEnrolledVoice(
  gate: SpeakerGate,
  samples: Float32Array,
  sampleRate: number,
): Promise<boolean> {
  const speech = lastSpeech(samples, sampleRate);
  const candidate = await gate.model.embed(speech?.samples ?? samples, sampleRate);
  let best = -Infinity;
  for (const enrolled of gate.embeddings) best = Math.max(best, cosine(candidate, enrolled));
  return best >= gate.threshold;
}
