import { toSpeakable } from "@server/modules/assistant/service/speakable";

import { describe, expect, test } from "bun:test";

describe("toSpeakable", () => {
  test.each([
    ["Pronto, liguei a **luz da sala**.", "Pronto, liguei a luz da sala."],
    [
      "Sua agenda de hoje:\n\n- **09:00** Reunião\n- 14:30 Dentista\n- _18:00_ Academia",
      "Sua agenda de hoje: 09:00 Reunião. 14:30 Dentista. 18:00 Academia",
    ],
    ["## Linhas\n1. Linha 9: lenta\n2) Linha 11 parada", "Linhas. Linha 9: lenta. Linha 11 parada"],
    ["Veja [o status](https://x.y) e o `servidor`: https://x.y/z", "Veja o status e o servidor:"],
    ["| Sensor | Temp |\n|---|---|\n| Sala | 23 °C |", "Sensor, Temp. Sala, 23 °C"],
    ["Código:\n```js\nconsole.log(1)\n```\nFeito!", "Código: Feito!"],
    ["> Citação\n\n~~antigo~~ novo", "Citação. antigo novo"],
    ["- [x] feito\n- [ ] pendente", "feito. pendente"],
    ["snake_case_name e 2*3*4 ficam iguais", "snake_case_name e 2*3*4 ficam iguais"],
    ["![foto](https://x/y.png)", ""],
  ])("%p", (markdown, spoken) => {
    expect(toSpeakable(markdown)).toBe(spoken);
  });
});
