import { ACTION_CLAIM } from "@server/modules/assistant/service/claims";

/** Shorter pieces sound choppy and cost a TTS request each. */
const MIN_CHUNK = 30;
const BOUNDARY = /[.!?…]+["')]*\s|\n/g;

/**
 * Cuts a reply being streamed into sentences, handed to `say` as soon as they
 * are complete, so the voice starts before the model finishes writing.
 *
 * A sentence that claims a change ("liguei a luz") is held back until a write
 * action has succeeded: the server swaps such a claim for an honest failure
 * (`guardActionClaims`), and the voice must not say it first. Everything held
 * back, and whatever is left, is spoken from the final reply by `finish`.
 */
export function createSentencer(say: (text: string) => void, changedSomething: () => boolean) {
  let buffer = "";
  let spoken = "";
  let held = false;

  const take = (): string | null => {
    BOUNDARY.lastIndex = 0;
    for (let m = BOUNDARY.exec(buffer); m; m = BOUNDARY.exec(buffer)) {
      const end = m.index + m[0].length;
      if (end >= MIN_CHUNK) {
        const sentence = buffer.slice(0, end);
        buffer = buffer.slice(end);
        return sentence;
      }
    }
    return null;
  };

  return {
    push(delta: string) {
      if (held) return;
      buffer += delta;
      for (let sentence = take(); sentence; sentence = take()) {
        if (ACTION_CLAIM.test(sentence) && !changedSomething()) {
          held = true;
          return;
        }
        spoken += sentence;
        say(sentence);
      }
    },
    /**
     * The text still to speak from the final reply, or null when the reply
     * does not continue what was already said (the caller speaks it all again).
     */
    finish(reply: string): string | null {
      const done = spoken.trim();
      return reply.startsWith(done) ? reply.slice(done.length).trimStart() : null;
    },
  };
}
