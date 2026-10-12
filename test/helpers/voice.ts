import { mock } from "bun:test";

/** Fake capture rate: 1600 samples = 100 ms keeps the VAD maths readable. */
export const FAKE_SAMPLE_RATE = 16000;

type Listener = (message: unknown) => void;

export class FakeRecognizer {
  listeners = new Map<string, Listener>();
  chunks = 0;
  removed = false;
  constructor(
    public sampleRate: number,
    public grammar?: string,
  ) {
    voice.recognizers.push(this);
  }
  on(event: string, listener: Listener) {
    this.listeners.set(event, listener);
  }
  acceptWaveformFloat() {
    this.chunks++;
  }
  remove() {
    this.removed = true;
  }
  /** Emits a final Vosk result. */
  result(text: string) {
    this.listeners.get("result")?.({ event: "result", result: { text } });
  }
}

export class FakeVoskClient {
  listeners = new Map<string, Listener>();
  terminated = false;
  KaldiRecognizer = FakeRecognizer;
  constructor(public options: Record<string, unknown>) {
    voice.clients.push(this);
    queueMicrotask(() => {
      if (voice.modelError) this.listeners.get("error")?.({ event: "error", error: voice.modelError });
      else this.listeners.get("load")?.({ event: "load", result: voice.modelLoads });
    });
  }
  on(event: string, listener: Listener) {
    this.listeners.set(event, listener);
  }
  terminate() {
    this.terminated = true;
  }
}

class FakePort {
  onmessage: ((event: { data: Float32Array }) => void) | null = null;
}

class FakeWorkletNode {
  port = new FakePort();
  constructor(public context: FakeAudioContext) {
    voice.taps.push(this);
  }
  disconnect() {}
}

export class FakeBufferSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  constructor() {
    voice.sources.push(this);
  }
  connect() {}
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

const node = () => ({
  connect: () => {},
  disconnect: () => {},
  gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
  frequency: { value: 0 },
  start: () => void voice.tones++,
  stop: () => {},
});

export class FakeAudioContext {
  sampleRate = FAKE_SAMPLE_RATE;
  currentTime = 0;
  destination = {};
  closed = false;
  resumed = 0;
  audioWorklet = {
    addModule: async () => {
      if (voice.workletFails) throw new Error("worklet blocked");
    },
  };
  constructor() {
    voice.contexts.push(this);
  }
  createMediaStreamSource() {
    return node();
  }
  createGain = node;
  createOscillator = node;
  createBufferSource() {
    return new FakeBufferSource();
  }
  async decodeAudioData(bytes: ArrayBuffer) {
    if (voice.decodeFails) throw new Error("bad mp3");
    return { length: bytes.byteLength };
  }
  async resume() {
    this.resumed++;
  }
  async close() {
    this.closed = true;
  }
}

/** Shared, resettable state behind the fake browser audio stack. */
export const voice = {
  clients: [] as FakeVoskClient[],
  recognizers: [] as FakeRecognizer[],
  contexts: [] as FakeAudioContext[],
  taps: [] as FakeWorkletNode[],
  sources: [] as FakeBufferSource[],
  tracksStopped: 0,
  tones: 0,
  micDenied: false,
  workletFails: false,
  decodeFails: false,
  modelLoads: true,
  modelError: "",
  reset() {
    this.clients = [];
    this.recognizers = [];
    this.contexts = [];
    this.taps = [];
    this.sources = [];
    this.tracksStopped = 0;
    this.tones = 0;
    this.micDenied = false;
    this.workletFails = false;
    this.decodeFails = false;
    this.modelLoads = true;
    this.modelError = "";
  },
  /** Open microphone taps (their contexts are not closed). */
  get openTaps(): FakeWorkletNode[] {
    return this.taps.filter((tap) => !tap.context.closed && tap.port.onmessage);
  },
  /** Feeds `ms` of audio at `level` amplitude to every open microphone. */
  feed(level: number, ms: number) {
    const chunks = Math.round(ms / 100);
    for (let i = 0; i < chunks; i++) {
      for (const tap of this.openTaps) {
        tap.port.onmessage?.({ data: new Float32Array(1600).fill(level) });
      }
    }
  },
  /** Speech (loud) followed by enough silence to end the utterance. */
  utter(speechMs = 500, silenceMs = 1300) {
    this.feed(0.3, speechMs);
    this.feed(0, silenceMs);
  },
  /** Finishes the most recent reply being played. */
  finishPlayback() {
    const source = this.sources.at(-1);
    if (!source?.onended) throw new Error("Nothing is playing");
    source.onended();
  },
};

const realAudioContext = globalThis.AudioContext;
const realWorkletNode = globalThis.AudioWorkletNode;
const realMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

/** Installs the fake Web Audio stack, microphone and Vosk; returns a restore. */
export function installVoiceFakes(): () => void {
  mock.module("@lichess-org/vosk-browser", () => ({ VoskClient: FakeVoskClient }));
  globalThis.AudioContext = FakeAudioContext as never;
  globalThis.AudioWorkletNode = FakeWorkletNode as never;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => {
        if (voice.micDenied) throw new Error("Permission denied");
        return { getTracks: () => [{ stop: () => void voice.tracksStopped++ }] };
      },
    },
  });
  return () => {
    globalThis.AudioContext = realAudioContext;
    globalThis.AudioWorkletNode = realWorkletNode;
    if (realMediaDevices) Object.defineProperty(navigator, "mediaDevices", realMediaDevices);
    else delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  };
}

interface StreamedReply {
  conversationId: string;
  reply: string;
}

/** The SSE events of a reply: conversation, `before` events, the text in two deltas, done. */
export function replyEvents(reply: StreamedReply, before: unknown[] = []): unknown[] {
  const half = Math.ceil(reply.reply.length / 2);
  return [
    { type: "conversation", conversationId: reply.conversationId },
    ...before,
    { type: "delta", text: reply.reply.slice(0, half) },
    { type: "delta", text: reply.reply.slice(half) },
    { type: "done", reply },
  ];
}

/** A raw SSE body for a reply, for tests that hand-roll `fetch`. */
export function replyStreamBody(reply: StreamedReply): string {
  return replyEvents(reply)
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
}

/** A streaming response the test feeds event by event. */
export function controlledStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body, { headers: { "content-type": "text/event-stream" } }),
    push: (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
    close: () => controller.close(),
  };
}
