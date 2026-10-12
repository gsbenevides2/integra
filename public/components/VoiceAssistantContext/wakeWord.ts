import { type KaldiRecognizer, VoskClient } from "@lichess-org/vosk-browser";

import { type Microphone, openMicrophone } from "./microphone";
import { cosine, loadSpeakerModel, type SpeakerModel } from "./speakerModel";
import type { VoiceProfile } from "./voiceProfile";

export const MODEL_URL = "/vosk/vosk-model-small-pt.tar.gz";
export const WORKER_URL = "/vosk/vosk.worker.js";
export const WASM_URL = "/vosk/vosk.wasm";

/**
 * The recognizer's whole vocabulary: anything else becomes [unk]. Change the
 * wake phrase here; no training is needed. "hey" is not in the Portuguese
 * model's vocabulary, and a spoken "hey integra" is recognised as "ei integra".
 */
export const WAKE_PHRASES = ["ei integra", "integra"];
/** Ignore repeated detections of the same utterance. */
export const WAKE_COOLDOWN_MS = 3000;

/** How much recent audio to keep for the speaker check (covers the wake phrase). */
export const SPEAKER_BUFFER_MS = 1500;

/**
 * Only a final result that is exactly a wake phrase counts. Partial results
 * and results mixed with [unk] fire on ordinary speech ("bom dia...", "a
 * integração...") far too often.
 */
export function isWakePhrase(text: string): boolean {
  return WAKE_PHRASES.includes(text.trim());
}

export interface WakeWordEngine {
  stop: () => Promise<void>;
}

/** The speaker check applied before a wake word fires, or null to skip it. */
export interface SpeakerGate {
  model: SpeakerModel;
  /** The enrolled user's L2-normalised embeddings. */
  profile: VoiceProfile;
  /** Minimum cosine similarity to accept the voice. */
  threshold: number;
}

/**
 * Loads the speaker model and the user's profile for a wake-word speaker gate,
 * or returns null when there is nothing to check against: no model deployed,
 * no profile enrolled, or the model id no longer matches the enrolment. When
 * null, the wake word fires for any voice (the pre-enrolment behaviour).
 */
export async function buildSpeakerGate(
  voiceModelUrl: string | null,
  voiceModelId: string,
  profile: VoiceProfile | null,
  threshold: number,
): Promise<SpeakerGate | null> {
  if (!voiceModelUrl || !profile?.enrolled || profile.embeddings.length === 0) {
    return null;
  }
  if (profile.modelId !== voiceModelId) return null;
  try {
    const model = await loadSpeakerModel(voiceModelUrl, voiceModelId);
    return { model, profile, threshold };
  } catch {
    // If the model fails to load, fall back to firing for any voice.
    return null;
  }
}

/** Loads the model (cached in IndexedDB after the first download). */
function loadModel(): Promise<VoskClient> {
  const client = new VoskClient({
    modelUrl: MODEL_URL,
    workerUrl: WORKER_URL,
    wasmUrl: WASM_URL,
    logLevel: -1,
  });
  return new Promise((resolve, reject) => {
    client.on("load", (message) => {
      if ("result" in message && message.result) resolve(client);
      else reject(new Error("Falha ao carregar o modelo de voz"));
    });
    client.on("error", (message) => {
      client.terminate();
      reject(new Error("error" in message ? message.error : "Falha no modelo de voz"));
    });
  });
}

/**
 * Starts offline wake word detection with Vosk restricted to WAKE_PHRASES.
 * Audio never leaves the browser until `onDetect` fires.
 *
 * When `gate` is given, a detected phrase only fires if the voice that said it
 * matches the enrolled profile (cosine ≥ threshold): this is what keeps other
 * people and the TV from triggering "Ei Integra". Without a gate it fires for
 * any voice.
 */
export async function startWakeWord(
  onDetect: () => void,
  gate: SpeakerGate | null = null,
): Promise<WakeWordEngine> {
  const client = await loadModel();
  let recognizer: KaldiRecognizer | null = null;
  let microphone: Microphone;

  // Ring buffer of the most recent audio, so the phrase just heard is still
  // available for the speaker check when Vosk reports it.
  let ring: Float32Array | null = null;
  let ringRate = 0;
  let ringWrite = 0;
  let ringFilled = false;
  const pushRing = (samples: Float32Array, sampleRate: number) => {
    if (!gate) return;
    if (!ring || ringRate !== sampleRate) {
      ringRate = sampleRate;
      ring = new Float32Array(Math.ceil((SPEAKER_BUFFER_MS / 1000) * sampleRate));
      ringWrite = 0;
      ringFilled = false;
    }
    for (let i = 0; i < samples.length; i++) {
      ring[ringWrite] = samples[i]!;
      ringWrite = (ringWrite + 1) % ring.length;
      if (ringWrite === 0) ringFilled = true;
    }
  };
  const ringSnapshot = (): { samples: Float32Array; sampleRate: number } | null => {
    if (!ring) return null;
    const length = ringFilled ? ring.length : ringWrite;
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const idx = ringFilled ? (ringWrite + i) % ring.length : i;
      out[i] = ring[idx]!;
    }
    return { samples: out, sampleRate: ringRate };
  };

  try {
    microphone = await openMicrophone((samples, sampleRate) => {
      pushRing(samples, sampleRate);
      recognizer?.acceptWaveformFloat(samples, sampleRate);
    });
  } catch (error) {
    client.terminate();
    throw error;
  }

  let lastDetection = -Infinity;
  /** True while a speaker check is running, so a second phrase is ignored. */
  let verifying = false;

  const accept = () => {
    lastDetection = performance.now();
    onDetect();
  };

  const verify = async () => {
    const snapshot = ringSnapshot();
    if (!gate || !snapshot) {
      accept();
      return;
    }
    verifying = true;
    try {
      const candidate = await gate.model.embed(snapshot.samples, snapshot.sampleRate);
      let best = -Infinity;
      for (const enrolled of gate.profile.embeddings) {
        best = Math.max(best, cosine(candidate, enrolled));
      }
      if (best >= gate.threshold) accept();
    } catch {
      // If the check fails, err toward not firing: it is the speaker gate's job.
    } finally {
      verifying = false;
    }
  };

  const check = (text: string) => {
    const now = performance.now();
    if (!isWakePhrase(text) || verifying || now - lastDetection < WAKE_COOLDOWN_MS) {
      return;
    }
    void verify();
  };
  recognizer = new client.KaldiRecognizer(
    microphone.sampleRate,
    JSON.stringify([...WAKE_PHRASES, "[unk]"]),
  );
  recognizer.on("result", (message) => {
    if ("result" in message && "text" in message.result) check(message.result.text);
  });

  return {
    stop: async () => {
      await microphone.stop();
      recognizer?.remove();
      client.terminate();
    },
  };
}
