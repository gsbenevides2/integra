import React, { useEffect, useRef, useState } from "react";

import { MessageMarkdown } from "./MessageMarkdown";

/** Typing speed: one character every TYPING_INTERVAL_MS (~50 per second). */
export const TYPING_INTERVAL_MS = 20;
/** Beyond this many characters behind, typing speeds up to catch up. */
export const MAX_TYPING_LAG = 150;

/**
 * Reveals `text` at a steady typing pace. A model writes a short reply in
 * about half a second, often several pieces per network packet, so showing
 * the stream as it arrives looks like the text popping in at once.
 * With `animate` false (e.g. history) the text shows complete right away.
 */
export function useTypewriter(text: string, animate: boolean): string {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (shown >= text.length) return;
    const behind = text.length - shown;
    const step = Math.max(1, Math.floor(behind / MAX_TYPING_LAG));
    const timer = setTimeout(
      () => setShown((current) => Math.min(text.length, current + step)),
      TYPING_INTERVAL_MS,
    );
    return () => clearTimeout(timer);
  }, [shown, text]);
  return text.slice(0, shown);
}

interface Props {
  text: string;
  /** A reply received live (streamed now), as opposed to loaded from history. */
  live?: boolean;
}

/**
 * A reply's markdown, typed in when it is live. Key it by message so each
 * reply gets its own typing state.
 */
export function TypedText({ text, live }: Props) {
  // Decided once, so a reply never restarts typing when it re-renders.
  const animate = useRef(Boolean(live)).current;
  return <MessageMarkdown text={useTypewriter(text, animate)} />;
}
