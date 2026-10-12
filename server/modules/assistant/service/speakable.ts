/** Ends a line with a pause unless it already ends a sentence. */
function withPause(line: string): string {
  return /[.!?:;,]$/.test(line) ? line : `${line}.`;
}

/**
 * Turns a markdown reply into text for speech: the chat renders the markdown,
 * but the voice must not read "asterisco", "hashtag" or URLs aloud. List items
 * and table rows become sentences; code blocks are skipped.
 */
export function toSpeakable(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_](\S(?:[^*_\n]*?\S)?)[*_](?=[\s).,!?:;]|$)/gm, "$1$2");

  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s{0,3}>\s?/, "")
        .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, "")
        .replace(/^\s*\d+[.)]\s+/, "")
        // Table separators vanish; cells are read as a list.
        .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/, "")
        .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
        .replace(/\s*\|\s*/g, ", ")
        .trim(),
    )
    .filter(Boolean)
    .map((line, index, lines) => (index < lines.length - 1 ? withPause(line) : line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
