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

/** Fetches the reply's speech from the server and plays it. */
export function speak(text: string): Speaking {
  let source: AudioBufferSourceNode | null = null;
  let settle: (() => void) | undefined;
  let stopped = false;

  const done = new Promise<void>((resolve, reject) => {
    settle = resolve;
    fetch("/api/assistant/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao gerar a fala");
        const bytes = await response.arrayBuffer();
        const context = outputContext();
        // Not awaited: before any user gesture it stays pending, and playback
        // simply starts once the page is touched (see resumeAudio).
        void context.resume();
        const buffer = await context.decodeAudioData(bytes);
        if (stopped) return resolve();
        source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = () => resolve();
        source.start();
      })
      .catch((error: unknown) => {
        if (stopped) return resolve();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });

  return {
    done,
    stop: () => {
      stopped = true;
      if (source) {
        source.onended = null;
        source.stop();
      }
      settle?.();
    },
  };
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
