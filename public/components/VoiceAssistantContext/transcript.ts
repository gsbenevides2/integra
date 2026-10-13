/**
 * Turns a raw transcript into what the user said. Scribe annotates sounds that
 * are not speech ("[phone notification sound]", "[beep]", "[typing]"); those
 * are dropped, and so is anything left empty. Only the words count.
 */
export function cleanTranscript(text: string): string {
  return text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}
