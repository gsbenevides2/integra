import { createSentencer } from "@public/components/VoiceAssistantContext/speechStream";

import { describe, expect, test } from "bun:test";

function run(deltas: string[], changed = false) {
  const said: string[] = [];
  const sentencer = createSentencer((s) => said.push(s), () => changed);
  for (const delta of deltas) sentencer.push(delta);
  return { said, sentencer };
}

describe("createSentencer", () => {
  test("speaks each full sentence as it completes and the rest from the final reply", () => {
    const reply = "A sala está a vinte e dois graus. A cozinha está a vinte e quatro.";
    const { said, sentencer } = run(["A sala está a vinte", " e dois graus. A coz", "inha está a vinte e quatro."]);
    expect(said).toEqual(["A sala está a vinte e dois graus. "]);
    expect(sentencer.finish(reply)).toBe("A cozinha está a vinte e quatro.");
  });

  test("merges sentences that are too short and keeps decimals whole", () => {
    const { said } = run(["Sim. A temperatura é 22.5 graus lá fora. "]);
    expect(said).toEqual(["Sim. A temperatura é 22.5 graus lá fora. "]);
  });

  test("holds back a claim until a write action succeeded", () => {
    const text = "Pronto, desliguei a luz da sala. Mais alguma coisa por aqui? ";
    expect(run([text]).said).toEqual([]);
    expect(run([text], true).said).toHaveLength(1);
    // Nothing was said yet: the whole final reply is spoken.
    expect(run([text]).sentencer.finish("Não consegui fazer isso agora.")).toBe("Não consegui fazer isso agora.");
    // Something else was said and the reply no longer continues it: start over.
    const diverged = run(["O tempo lá fora está bem agradável hoje. Desliguei a luz. "]);
    expect(diverged.sentencer.finish("Não consegui fazer isso agora.")).toBeNull();
  });
});
