import { type Microphone, openMicrophone } from "./microphone";
import { cleanTranscript } from "./transcript";
import { encodeWav } from "./wav";

/** Energy-based end-of-utterance detection, tuned for a quiet room. */
export const VAD = {
  /** Floor for the speech threshold (RMS of a -1..1 signal). */
  minThreshold: 0.015,
  /** Speech must be this many times louder than the measured noise. */
  noiseFactor: 3,
  /** Continuous loud audio needed before it counts as speech. */
  speechStartMs: 150,
  /** Silence after speech that ends the utterance. */
  speechEndMs: 1200,
  /** Hard cap on one recording. */
  maxUtteranceMs: 20000,
};

export interface Listening {
  /** The transcribed utterance, or "" when nobody spoke. */
  result: Promise<string>;
  cancel: () => void;
}

interface ListenOptions {
  /** Speech was first detected ("speech"), then recording ended ("transcribing"). */
  onPhase: (phase: "speech" | "transcribing") => void;
  /** Give up when no speech at all is heard within this window. */
  silenceTimeoutMs: number;
  /**
   * The first audio of this length is dropped: the echo of a chime that just
   * played would otherwise count as the user's speech and end the utterance.
   */
  skipMs?: number;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

async function transcribe(wav: Uint8Array<ArrayBuffer>): Promise<string> {
  const response = await fetch("/api/assistant/stt", {
    method: "POST",
    headers: { "content-type": "audio/wav" },
    body: wav,
  });
  if (!response.ok) throw new Error("Falha na transcrição");
  const { text } = (await response.json()) as { text: string };
  return cleanTranscript(text);
}

/**
 * Records one utterance (ending on silence), transcribes it with Scribe on the server and resolves with the text.
 */
export function listenOnce({ onPhase, silenceTimeoutMs, skipMs = 0 }: ListenOptions): Listening {
  let finished = false;
  let microphone: Microphone | null = null;
  let settle: ((text: string) => void) | undefined;

  const result = new Promise<string>((resolve, reject) => {
    const chunks: Float32Array[] = [];
    let elapsedMs = 0;
    let loudMs = 0;
    let heardSpeech = false;
    let lastVoiceMs = 0;
    let noise = VAD.minThreshold / VAD.noiseFactor;

    let sampleRate = 0;
    let skippedMs = 0;

    const finish = (record: boolean) => {
      if (finished) return;
      finished = true;
      void microphone?.stop();
      if (!record) return resolve("");
      onPhase("transcribing");
      transcribe(encodeWav(chunks, sampleRate)).then(resolve, reject);
    };
    settle = () => finish(false);

    openMicrophone((samples, rate) => {
      if (finished) return;
      if (skippedMs < skipMs) {
        skippedMs += (samples.length / rate) * 1000;
        return;
      }
      sampleRate = rate;
      chunks.push(samples);
      const chunkMs = (samples.length / rate) * 1000;
      elapsedMs += chunkMs;
      const level = rms(samples);
      const threshold = Math.max(VAD.minThreshold, noise * VAD.noiseFactor);
      if (level > threshold) {
        loudMs += chunkMs;
        lastVoiceMs = elapsedMs;
        if (!heardSpeech && loudMs >= VAD.speechStartMs) {
          heardSpeech = true;
          onPhase("speech");
        }
      } else {
        if (!heardSpeech) loudMs = 0;
        noise = noise * 0.95 + level * 0.05;
      }

      if (heardSpeech && elapsedMs - lastVoiceMs >= VAD.speechEndMs) finish(true);
      else if (!heardSpeech && elapsedMs >= silenceTimeoutMs) finish(false);
      else if (elapsedMs >= VAD.maxUtteranceMs) finish(true);
    })
      .then((opened) => {
        microphone = opened;
        if (finished) void opened.stop();
      })
      .catch((error: unknown) => {
        finished = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });

  return { result, cancel: () => settle?.("") };
}
