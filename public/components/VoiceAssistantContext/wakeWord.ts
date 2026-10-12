import { type KaldiRecognizer, VoskClient } from "@lichess-org/vosk-browser";

import { type Microphone, openMicrophone } from "./microphone";

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
 */
export async function startWakeWord(onDetect: () => void): Promise<WakeWordEngine> {
  const client = await loadModel();
  let recognizer: KaldiRecognizer | null = null;
  let microphone: Microphone;
  try {
    microphone = await openMicrophone((samples, sampleRate) =>
      recognizer?.acceptWaveformFloat(samples, sampleRate),
    );
  } catch (error) {
    client.terminate();
    throw error;
  }

  let lastDetection = -Infinity;
  const check = (text: string) => {
    const now = performance.now();
    if (!isWakePhrase(text) || now - lastDetection < WAKE_COOLDOWN_MS) return;
    lastDetection = now;
    onDetect();
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
