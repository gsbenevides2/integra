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

/** Receives each chunk with the capture sample rate. */
export type ChunkListener = (samples: Float32Array, sampleRate: number) => void;

interface Device {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  tap: AudioWorkletNode;
}

/**
 * One microphone shared by everyone listening (wake word and transcriber).
 * Opening a second one for each utterance took a few hundred milliseconds,
 * long enough to lose the first syllables said right after the chime.
 */
let device: Promise<Device> | null = null;
const listeners = new Set<ChunkListener>();
/** Every open microphone's context, so a user gesture can resume them all. */
const liveContexts = new Set<AudioContext>();

async function openDevice(): Promise<Device> {
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
      listeners.forEach((listener) => listener(event.data, context.sampleRate));
    source.connect(tap);
    liveContexts.add(context);
    return { context, stream, source, tap };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
    throw error;
  }
}

async function closeDevice({ context, stream, source, tap }: Device): Promise<void> {
  liveContexts.delete(context);
  tap.port.onmessage = null;
  source.disconnect();
  stream.getTracks().forEach((track) => track.stop());
  await context.close();
}

/**
 * Streams mono Float32 chunks to `onChunk` from the shared microphone,
 * opening it on first use; it closes when the last listener stops.
 */
export async function openMicrophone(onChunk: ChunkListener): Promise<Microphone> {
  // A function of its own, so the same callback can subscribe twice.
  const listener: ChunkListener = (samples, sampleRate) => onChunk(samples, sampleRate);
  listeners.add(listener);
  const opening = (device ??= openDevice());
  let opened: Device;
  try {
    opened = await opening;
  } catch (error) {
    listeners.delete(listener);
    if (device === opening) device = null;
    throw error;
  }
  let stopped = false;
  return {
    sampleRate: opened.context.sampleRate,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      listeners.delete(listener);
      if (listeners.size > 0 || device !== opening) return;
      device = null;
      await closeDevice(opened);
    },
  };
}

/**
 * Browsers create audio contexts suspended until a user gesture; a kiosk that
 * was never touched would otherwise never hear the wake word.
 */
export function resumeAudio(): void {
  liveContexts.forEach((context) => void context.resume());
  resumeOutput();
}
