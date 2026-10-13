import { describe, expect, test } from "bun:test";

const { cleanTranscript } = await import("@public/components/VoiceAssistantContext/transcript");
const { matchesEnrolledVoice } = await import("@public/components/VoiceAssistantContext/utterance");

describe("cleanTranscript", () => {
  test.each([
    ["[phone notification sound]", ""],
    ["[出音]", ""],
    ["[som de teclado] Aplicar a cena azul", "Aplicar a cena azul"],
    ["  liga a   luz  ", "liga a luz"],
    ["", ""],
  ])("%p -> %p", (input, output) => {
    expect(cleanTranscript(input)).toBe(output);
  });
});

describe("matchesEnrolledVoice", () => {
  const gate = (vector: number[], threshold = 0.6) => ({
    model: {
      embed: async () => new Float32Array(vector),
    },
    embeddings: [[1, 0, 0]],
    threshold,
  });
  const loud = new Float32Array(16000).fill(0.3);

  test("accepts a voice close to an enrolled one", async () => {
    expect(await matchesEnrolledVoice(gate([0.9, 0.1, 0]) as never, loud, 16000)).toBe(true);
  });

  test("rejects a voice that is not enrolled (e.g. the TV)", async () => {
    expect(await matchesEnrolledVoice(gate([0, 1, 0]) as never, loud, 16000)).toBe(false);
  });
});
