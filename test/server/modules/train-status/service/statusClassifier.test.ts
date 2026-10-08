import { getTrainLineStatus } from "@server/modules/train-status/service/statusClassifier";

import { expect, test } from "bun:test";

test.each([
  ["Operação Normal", "OK"],
  ["Velocidade reduzida", "WARNING"],
  ["Operação parcial", "WARNING"],
  ["Atividade Programada", "WARNING"],
  ["Paralisada", "CRITICAL"],
  ["algo inesperado", "UNKNOWN"],
])("%s -> %s", (situation, expected) => {
  expect(getTrainLineStatus(situation)).toBe(expected as never);
});
