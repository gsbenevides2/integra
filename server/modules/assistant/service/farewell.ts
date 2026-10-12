import { normalizeName } from "../tools/guard";

/** Longer utterances are requests that happen to contain a goodbye word. */
const MAX_FAREWELL_WORDS = 8;

/** Phrases that end the conversation (accent-free, lowercase). */
const FAREWELL = new RegExp(
  "\\b(" +
    [
      "tchau",
      "chau",
      "ate (logo|mais|depois|amanha|a proxima)",
      "falou",
      "fui",
      "(era|e) so isso",
      "so isso",
      "mais nada",
      "nada mais",
      "pode (parar|desligar|encerrar|ir)",
      "encerr(a|ar|e)( a conversa)?",
      "obrigad[oa]( integra)?$",
      "muito obrigad[oa]",
      "valeu",
    ].join("|") +
    ")\\b",
);

/**
 * A deterministic backstop for the model's `encerrar_conversa` tool: a short
 * utterance that is clearly a goodbye ("valeu, era só isso", "obrigado,
 * tchau", a bare "obrigado") always ends the voice session.
 */
export function isFarewell(text: string): boolean {
  const normalized = normalizeName(text).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (normalized.split(" ").length > MAX_FAREWELL_WORDS) return false;
  return FAREWELL.test(normalized);
}
