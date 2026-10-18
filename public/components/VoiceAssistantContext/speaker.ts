export interface Speaking {
  done: Promise<void>;
  stop: () => void;
}

/**
 * One shared output context. Replies are played through Web Audio instead of
 * an <audio> element: with the microphone open for the wake word, browsers
 * (notably Chrome on Android) pause media elements as soon as they start
 * ("The play() request was interrupted by a call to pause()").
 */
let output: AudioContext | null = null;

function outputContext(): AudioContext {
  output ??= new AudioContext();
  return output;
}

/** Resumes the output context after a user gesture (see resumeAudio). */
export function resumeOutput(): void {
  void output?.resume();
}

async function loadSpeech(text: string): Promise<AudioBuffer> {
  const response = await fetch("/api/assistant/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error("Falha ao gerar a fala");
  const bytes = await response.arrayBuffer();
  const context = outputContext();
  // Not awaited: before any user gesture it stays pending, and playback
  // simply starts once the page is touched (see resumeAudio).
  void context.resume();
  return context.decodeAudioData(bytes);
}

export interface Speech extends Speaking {
  /** Queues a piece of the reply. Its audio is fetched now and played in order. */
  say: (text: string) => void;
  /** Nothing more will be queued: `done` settles once everything has played. */
  end: () => void;
}

/**
 * Speaks a reply piece by piece: every piece is synthesised as soon as it is
 * queued (in parallel), and played one after another.
 */
export function createSpeech(): Speech {
  let source: AudioBufferSourceNode | null = null;
  let stopped = false;
  let tail = Promise.resolve();
  let finish: { resolve: () => void; reject: (error: Error) => void };
  const done = new Promise<void>((resolve, reject) => {
    finish = { resolve, reject };
  });
  tail.catch(() => {});

  return {
    done,
    say: (text) => {
      if (stopped) return;
      const loading = loadSpeech(text);
      loading.catch(() => {});
      tail = tail.then(async () => {
        const buffer = await loading;
        if (stopped) return;
        await new Promise<void>((resolve) => {
          source = outputContext().createBufferSource();
          source.buffer = buffer;
          source.connect(outputContext().destination);
          source.onended = () => resolve();
          source.start();
        });
      });
      tail.catch(() => {});
    },
    end: () =>
      void tail.then(finish.resolve, (error: unknown) =>
        stopped ? finish.resolve() : finish.reject(error instanceof Error ? error : new Error(String(error))),
      ),
    stop: () => {
      stopped = true;
      if (source) {
        source.onended = null;
        source.stop();
      }
      finish.resolve();
    },
  };
}

/** Fetches the reply's speech from the server and plays it. */
export function speak(text: string): Speaking {
  const speech = createSpeech();
  speech.say(text);
  speech.end();
  return speech;
}

/** A soft blip while a slow tool runs, so the silence does not feel like a hang. */
export function playWaiting(): void {
  try {
    const context = outputContext();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 520;
    oscillator.connect(gain);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
  } catch {
    // No Web Audio (or blocked): the on-screen progress is enough.
  }
}

/** A short two-tone chime so the user knows the assistant is listening. */
export function playChime(): void {
  try {
    const context = outputContext();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.15, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3);
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.1);
      oscillator.stop(context.currentTime + 0.3);
    });
  } catch {
    // No Web Audio (or blocked): the visual state change is enough.
  }
}
