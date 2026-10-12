import { isFarewell } from "@server/modules/assistant/service/farewell";

import { describe, expect, test } from "bun:test";

describe("isFarewell", () => {
  test.each([
    "Obrigado, tchau!",
    "Valeu, era só isso.",
    "Obrigado!",
    "Obrigada Integra",
    "Muito obrigado.",
    "Pode parar.",
    "Tchau Integra",
    "Até logo",
    "Falou!",
    "É só isso, obrigado",
    "Ok, tchau",
    "Beleza, valeu Integra. Por hoje é só isso.",
  ])("%p ends the conversation", (text) => {
    expect(isFarewell(text)).toBe(true);
  });

  test.each([
    "Obrigado, e como estão as linhas de trem?",
    "Liga a luz da sala",
    "Desliga tudo e tchau não, espera, liga a luz da sala por favor agora",
    "Pode ligar a luz?",
    "Fui na cozinha e a luz não acendeu, liga ela pra mim",
    "Valeu, apaga a luz da sala",
    "Pode ir desligando tudo",
    "Não tem mais nada pra hoje?",
    "Fui no mercado",
    "Só isso?",
    "",
    "?!",
  ])("%p does not", (text) => {
    expect(isFarewell(text)).toBe(false);
  });
});
