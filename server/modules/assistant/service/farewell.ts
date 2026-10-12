import { normalizeName } from "../tools/guard";

/** Phrases that end the conversation (accent-free, lowercase). */
const FAREWELL_PHRASES = [
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
  "obrigad[oa]( integra)?",
  "muito obrigad[oa]",
  "valeu",
].join("|");

/** Words that may come with a goodbye without making it a request. */
const FILLERS = [
  "integra",
  "ok",
  "beleza",
  "certo",
  "entao",
  "bom",
  "ta",
  "e",
  "viu",
  "por (hoje|enquanto|agora)",
].join("|");

const FAREWELL = new RegExp(`\\b(${FAREWELL_PHRASES})\\b`);
const FAREWELL_OR_FILLER = new RegExp(`\\b(${FAREWELL_PHRASES}|${FILLERS})\\b`, "g");

/**
 * A deterministic backstop for the model's `encerrar_conversa` tool: an
 * utterance made only of goodbyes ("valeu, era só isso", "ok, tchau", a bare
 * "obrigado") ends the voice session. Anything else in it is a request ("fui
 * no mercado", "não tem mais nada hoje"), and a question wants an answer.
 */
export function isFarewell(text: string): boolean {
  if (text.trim().endsWith("?")) return false;
  const normalized = normalizeName(text).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
  if (!FAREWELL.test(normalized)) return false;
  return normalized.replace(FAREWELL_OR_FILLER, " ").trim() === "";
}
