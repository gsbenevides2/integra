import React, { useEffect } from "react";

const KEEP_S = 15; // buffered seconds kept behind the playhead
const TARGET_S = 0.75; // distance to the live edge after a jump
const JUMP_S = 6; // beyond this lag, skip ahead instead of speeding up
const SPEEDUP_S = 1.5; // beyond this lag, play faster to catch up

/**
 * Live fMP4 played through MediaSource so the lag can be controlled: a plain
 * `<video src>` buffers the keyframe backlog and plays it at 1x forever. Falls
 * back to `src` where MediaSource doesn't exist.
 */
export function LiveVideo({
  src,
  videoRef,
  ...props
}: {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
} & Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src">) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (typeof MediaSource === "undefined") {
      video.src = src;
      return;
    }
    const abort = new AbortController();
    const mediaSource = new MediaSource();
    const url = URL.createObjectURL(mediaSource);
    video.src = url;

    mediaSource.addEventListener(
      "sourceopen",
      async () => {
        try {
          const res = await fetch(src, { signal: abort.signal });
          const mime = res.headers.get("content-type");
          if (!res.ok || !res.body || !mime) return;
          const buffer = mediaSource.addSourceBuffer(mime);
          const queue: Uint8Array<ArrayBuffer>[] = [];
          const pump = () => {
            if (buffer.updating || !queue.length) return;
            try {
              buffer.appendBuffer(queue.shift()!);
            } catch {
              abort.abort(); // quota/decode error: stop, the user can resync
            }
          };
          buffer.addEventListener("updateend", () => {
            const { buffered } = buffer;
            if (!buffer.updating && buffered.length) {
              const cut = video.currentTime - KEEP_S;
              if (cut - buffered.start(0) > 1)
                return void buffer.remove(buffered.start(0), cut);
            }
            pump();
          });
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            queue.push(value as Uint8Array<ArrayBuffer>);
            pump();
          }
        } catch {
          // aborted on unmount, or the stream dropped
        }
      },
      { once: true },
    );

    // Chase the live edge (what Frigate's own MSE player does).
    const timer = setInterval(() => {
      const { buffered } = video;
      if (!buffered.length) return;
      const lag = buffered.end(buffered.length - 1) - video.currentTime;
      if (lag > JUMP_S)
        video.currentTime = buffered.end(buffered.length - 1) - TARGET_S;
      video.playbackRate =
        lag > SPEEDUP_S ? Math.min(2, 1 + 0.25 * (lag - 1)) : 1;
    }, 500);

    return () => {
      clearInterval(timer);
      abort.abort();
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [src, videoRef]);

  return <video ref={videoRef} {...props} />;
}
