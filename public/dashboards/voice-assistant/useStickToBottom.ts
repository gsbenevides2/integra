import { type RefObject, useEffect, useRef } from "react";

/** Within this distance (px) of the bottom the user is following the chat. */
export const STICK_THRESHOLD_PX = 48;

/**
 * Keeps a scrollable list at its end while content grows: new messages, text
 * being typed in and images finishing loading. If the user scrolls up to read,
 * it stops following until they come back down or a new message arrives.
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, messageCount: number) {
  const following = useRef(true);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    // At most once per frame: a reply being typed changes on every tick.
    let frame = 0;
    const follow = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (following.current) list.scrollTop = list.scrollHeight;
      });
    };
    const onScroll = () => {
      following.current =
        list.scrollHeight - list.scrollTop - list.clientHeight <= STICK_THRESHOLD_PX;
    };
    const observer = new MutationObserver(follow);
    observer.observe(list, { childList: true, subtree: true, characterData: true });
    list.addEventListener("scroll", onScroll, { passive: true });
    // Image load events do not bubble, so listen in the capture phase.
    list.addEventListener("load", follow, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      list.removeEventListener("scroll", onScroll);
      list.removeEventListener("load", follow, true);
    };
  }, [ref]);

  // A new message (sent or received) brings the view back to the end.
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    following.current = true;
    list.scrollTop = list.scrollHeight;
  }, [ref, messageCount]);
}
