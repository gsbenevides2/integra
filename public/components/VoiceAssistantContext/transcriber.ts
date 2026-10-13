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

/**
 * Who spoke: "verified" when the speaker check passed, "rejected" when it
 * failed (the utterance is dropped), "unknown" when there was no check to run.
 */
export type Speaker = "verified" | "rejected" | "unknown";

export interface Listening {
  /** The transcribed utterance, or "" when nobody spoke, or when it was rejected. */
  result: Promise<string>;
  /** Settles once the utterance is recorded and checked. */
  speaker: Promise<Speaker>;
  cancel: () => void;
}

interface ListenOptions {
  /** Speech was first detected ("speech"), then recording ended ("transcribing"). */
  onPhase: (phase: "speech" | "transcribing") => void;
  /** Give up when no speech at all is heard within this window. */
  silenceTimeoutMs: number;
  /**
   * Checks the recorded utterance before it is transcribed. A false result
   * drops it: nothing is sent to the server. Throwing counts as false.
   */
  verify?: (samples: Float32Array, sampleRate: number) => Promise<boolean>;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

function joinChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
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
 * Records one utterance (ending on silence), checks the speaker if asked to,
 * transcribes it with Scribe on the server and resolves with the text.
 */
export function listenOnce({ onPhase, silenceTimeoutMs, verify }: ListenOptions): Listening {
  let finished = false;
  let microphone: Microphone | null = null;
  let settle: ((text: string) => void) | undefined;
  let resolveSpeaker: (speaker: Speaker) => void = () => {};
  const speaker = new Promise<Speaker>((resolve) => {
    resolveSpeaker = resolve;
  });

  const result = new Promise<string>((resolve, reject) => {
    const chunks: Float32Array[] = [];
    let elapsedMs = 0;
    let loudMs = 0;
    let heardSpeech = false;
    let lastVoiceMs = 0;
    let noise = VAD.minThreshold / VAD.noiseFactor;

    let sampleRate = 0;

    const transcribeChunks = () => {
      onPhase("transcribing");
      transcribe(encodeWav(chunks, sampleRate)).then(resolve, reject);
    };

    const finish = (record: boolean) => {
      if (finished) return;
      finished = true;
      void microphone?.stop();
      if (!record) {
        resolveSpeaker("unknown");
        return resolve("");
      }
      if (!verify) {
        resolveSpeaker("unknown");
        return transcribeChunks();
      }
      verify(joinChunks(chunks), sampleRate).then(
        (matches) => {
          resolveSpeaker(matches ? "verified" : "rejected");
          if (matches) transcribeChunks();
          else resolve("");
        },
        () => {
          resolveSpeaker("rejected");
          resolve("");
        },
      );
    };
    settle = () => finish(false);

    openMicrophone((samples, rate) => {
      if (finished) return;
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
        resolveSpeaker("unknown");
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });

  return { result, speaker, cancel: () => settle?.("") };
}


export interface Captured {
  samples: Float32Array;
  sampleRate: number;
}

/** Nobody spoke before the timeout: the caller may simply ask again. */
export class NoSpeechError extends Error {
  constructor() {
    super("Não ouvi você dizer \"Ei Integra\"");
    this.name = "NoSpeechError";
  }
}

/**
 * Records one short utterance (ending on silence) and resolves with the raw
 * mono samples, for voice enrolment (the speaker-embedding model, not STT).
 * Rejects with NoSpeechError if no speech is heard within `silenceTimeoutMs`.
 */
export function captureUtterance(silenceTimeoutMs: number): Promise<Captured> {
  return new Promise<Captured>((resolve, reject) => {
    let microphone: Microphone | null = null;
    let finished = false;
    const chunks: Float32Array[] = [];
    let elapsedMs = 0;
    let loudMs = 0;
    let heardSpeech = false;
    let lastVoiceMs = 0;
    let noise = VAD.minThreshold / VAD.noiseFactor;
    let sampleRate = 0;

    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      void microphone?.stop();
      if (!ok) return reject(new NoSpeechError());
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const samples = new Float32Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      resolve({ samples, sampleRate });
    };

    openMicrophone((samples, rate) => {
      if (finished) return;
      sampleRate = rate;
      chunks.push(samples);
      const chunkMs = (samples.length / rate) * 1000;
      elapsedMs += chunkMs;
      const level = rms(samples);
      const threshold = Math.max(VAD.minThreshold, noise * VAD.noiseFactor);
      if (level > threshold) {
        loudMs += chunkMs;
        lastVoiceMs = elapsedMs;
        if (!heardSpeech && loudMs >= VAD.speechStartMs) heardSpeech = true;
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
}
