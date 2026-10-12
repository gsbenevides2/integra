import { resumeOutput } from "./speaker";

/** Samples per chunk handed to consumers (~43 ms at 48 kHz). */
export const CHUNK_SIZE = 2048;

/**
 * An AudioWorklet that batches the microphone's 128-sample render quanta into
 * CHUNK_SIZE chunks and posts them to the main thread. Inlined as a Blob URL
 * so it needs no separate bundled file.
 */
const TAP_PROCESSOR = `
class IntegraTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(${CHUNK_SIZE});
    this.length = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.length++] = channel[i];
      if (this.length === this.buffer.length) {
        this.port.postMessage(this.buffer);
        this.buffer = new Float32Array(${CHUNK_SIZE});
        this.length = 0;
      }
    }
    return true;
  }
}
registerProcessor("integra-tap", IntegraTap);
`;

export interface Microphone {
  sampleRate: number;
  stop: () => Promise<void>;
}

/** Every open microphone's context, so a user gesture can resume them all. */
const liveContexts = new Set<AudioContext>();

/** Opens the microphone and streams mono Float32 chunks to `onChunk`. */
export async function openMicrophone(
  onChunk: (samples: Float32Array) => void,
): Promise<Microphone> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  const context = new AudioContext();
  try {
    const url = URL.createObjectURL(
      new Blob([TAP_PROCESSOR], { type: "text/javascript" }),
    );
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = context.createMediaStreamSource(stream);
    const tap = new AudioWorkletNode(context, "integra-tap");
    tap.port.onmessage = (event: MessageEvent<Float32Array>) =>
      onChunk(event.data);
    source.connect(tap);
    liveContexts.add(context);
    return {
      sampleRate: context.sampleRate,
      stop: async () => {
        liveContexts.delete(context);
        tap.port.onmessage = null;
        source.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        await context.close();
      },
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
    throw error;
  }
}

/**
 * Browsers create audio contexts suspended until a user gesture; a kiosk that
 * was never touched would otherwise never hear the wake word.
 */
export function resumeAudio(): void {
  liveContexts.forEach((context) => void context.resume());
  resumeOutput();
}
