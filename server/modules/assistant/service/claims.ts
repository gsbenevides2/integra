// Pure, so the browser can use it too (it holds back spoken claims, see speechStream.ts).

/** Tools that change something in the house or cost money (see tools/*.ts `write`). */
export const WRITE_TOOLS = new Set([
  "controlar_dispositivo",
  "controlar_varios_dispositivos",
  "aplicar_cena",
  "executar_rotina",
  "gerar_imagem",
]);

/** Past-tense or future wording for a change, in pt-BR ("apliquei", "vou desligar", "foi desligada"). A bare "está desligada"
 * only describes a state, so a status answer is not a claim. */
export const ACTION_CLAIM =
  /\b(apliquei|reapliquei|apaguei|desliguei|liguei|acendi|coloquei|pus|pôs|ajustei|executei|(foi|foram|ficou|ficaram) (aplicad|desligad|apagad)[oa]s?|vou (ligar|desligar|apagar|acender|aplicar|colocar|ajustar|executar))\b/i;
