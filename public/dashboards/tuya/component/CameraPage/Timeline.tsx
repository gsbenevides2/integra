import React, { useLayoutEffect, useRef, useState } from "react";

import {
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@heroicons/react/24/outline";

export interface MotionBucket {
  start_time: number;
  /** 0-100, relative to the peak of its hour (Frigate normalizes it). */
  motion: number;
}

export interface ReviewSegment {
  id: string;
  start_time: number;
  /** Null while the segment is still open. */
  end_time: number | null;
  severity: "alert" | "detection";
  data?: { objects?: string[] };
}

/** Seconds per pixel, from the most zoomed in to the most zoomed out. */
const ZOOM_LEVELS = [4, 8, 15, 30, 60] as const;
/** Time between ruler ticks at each zoom level, so they stay ~60-75px apart. */
const TICK_SECONDS: Record<number, number> = {
  4: 300,
  8: 600,
  15: 900,
  30: 1800,
  60: 3600,
};
/** Width of each motion bucket, the `scale` the motion is fetched with. */
export const MOTION_SCALE = 30;

const clock = (time: number) =>
  new Date(time * 1000).toLocaleTimeString("pt-BR");
const shortClock = (time: number) =>
  new Date(time * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Frigate-style vertical timeline of one day, newest at the top: motion bars,
 * alert/detection bands and a playhead. Click, drag (mouse) or tap (touch) to
 * seek; on touch, swiping scrolls instead of scrubbing.
 */
export function Timeline({
  start,
  end,
  motion,
  reviews,
  recorded,
  current,
  onSeek,
}: {
  start: number;
  end: number;
  motion: MotionBucket[];
  reviews: ReviewSegment[];
  /** Start of each hour that has recordings. */
  recorded: Set<number>;
  current: number | null;
  onSeek: (time: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  /** Time to keep under the same screen offset across a zoom change. */
  const anchor = useRef<{ time: number; offset: number } | null>(null);

  const perPx = ZOOM_LEVELS[zoom]!;
  const y = (time: number) => (end - time) / perPx;
  const height = Math.ceil((end - start) / perPx);

  const timeAt = (clientY: number) => {
    const top = track.current!.getBoundingClientRect().top;
    const time = Math.round(end - (clientY - top) * perPx);
    return Math.min(end, Math.max(start, time));
  };

  const changeZoom = (next: number) => {
    const box = scroller.current!;
    const time = current ?? end - (box.scrollTop + box.clientHeight / 2) * perPx;
    anchor.current = { time, offset: y(time) - box.scrollTop };
    setZoom(next);
  };

  useLayoutEffect(() => {
    const box = scroller.current!;
    if (anchor.current) {
      box.scrollTop = y(anchor.current.time) - anchor.current.offset;
      anchor.current = null;
    }
    // Follow the playhead while it plays, unless the user is scrubbing.
    if (current === null || preview !== null) return;
    const at = y(current);
    // The margin keeps the time pill (centered on the line) from being cut off.
    const margin = 16;
    if (
      at < box.scrollTop + margin ||
      at > box.scrollTop + box.clientHeight - margin
    ) {
      box.scrollTop = at - box.clientHeight / 2;
    }
    // y only depends on end and zoom, both listed.
  }, [current, zoom, end, preview]);

  const ticks: number[] = [];
  for (let time = start; time <= end; time += TICK_SECONDS[perPx]!) {
    ticks.push(time);
  }
  const hours: number[] = [];
  for (let time = start; time < end; time += 3600) hours.push(time);

  // A clip can play past the end of the day (today's end is frozen when the
  // day is picked): keep the playhead on the drawn range.
  const clamp = (time: number) => Math.min(end, Math.max(start, time));
  const shown = preview ?? current;
  const playhead = shown === null ? null : clamp(shown);
  const zoomButton = `
    cursor-pointer rounded-full p-1.5 text-mist-300
    hover:bg-gray-800
    disabled:cursor-not-allowed disabled:opacity-30
  `;

  return (
    <div className="flex size-full min-h-0 flex-col rounded-lg bg-gray-900">
      <div
        ref={scroller}
        role="slider"
        tabIndex={0}
        aria-label="Linha do tempo"
        aria-orientation="vertical"
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={clamp(current ?? end)}
        aria-valuetext={current === null ? undefined : clock(current)}
        onKeyDown={(e) => {
          const step = { ArrowUp: MOTION_SCALE, ArrowDown: -MOTION_SCALE }[
            e.key
          ];
          if (!step) return;
          e.preventDefault();
          onSeek(Math.min(end, Math.max(start, (current ?? end) + step)));
        }}
        className="
          relative min-h-0 flex-1 scrollbar-none overflow-y-auto
          overscroll-contain rounded-t-lg outline-none
          focus-visible:ring-2 focus-visible:ring-blue-500
        "
      >
        <div
          ref={track}
          data-testid="timeline-track"
          style={{ height, touchAction: "pan-y" }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setPreview(timeAt(e.clientY));
          }}
          onPointerMove={(e) => {
            if (preview !== null) setPreview(timeAt(e.clientY));
          }}
          onPointerUp={(e) => {
            if (preview === null) return;
            setPreview(null);
            onSeek(timeAt(e.clientY));
          }}
          onPointerCancel={() => setPreview(null)}
          className="relative cursor-pointer select-none"
        >
          {hours
            .filter((hour) => !recorded.has(hour))
            .map((hour) => (
              <div
                key={`gap${hour}`}
                data-testid="timeline-gap"
                className="absolute inset-x-0 bg-black/50"
                style={{
                  top: y(Math.min(end, hour + 3600)),
                  height: (Math.min(end, hour + 3600) - hour) / perPx,
                }}
              />
            ))}
          {reviews.map((review) => {
            const until = Math.min(end, review.end_time ?? end);
            const from = Math.max(start, review.start_time);
            return (
              <div
                key={review.id}
                data-testid={`review-${review.severity}`}
                title={review.data?.objects?.join(", ")}
                className={`
                  absolute right-0 left-10 rounded-sm
                  ${review.severity === "alert" ? "bg-red-900/50" : `
                    bg-orange-900/40
                  `}
                `}
                style={{
                  top: y(until),
                  height: Math.max(2, (until - from) / perPx),
                }}
              />
            );
          })}
          {ticks.map((time) => (
            <div
              key={time}
              aria-hidden
              className="absolute inset-x-0 flex items-center gap-1"
              style={{ top: y(time) }}
            >
              <span className="h-px w-1.5 bg-gray-600" />
              <span className="-translate-y-px text-[10px] text-mist-500">
                {time < end ? shortClock(time) : ""}
              </span>
            </div>
          ))}
          {motion.map((bucket) => (
            <span
              key={bucket.start_time}
              data-testid="motion-bar"
              aria-hidden
              className="absolute right-1 left-11 flex justify-center"
              style={{
                top: y(Math.min(end, bucket.start_time + MOTION_SCALE)),
                height: Math.max(1, MOTION_SCALE / perPx - 0.5),
              }}
            >
              <span
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${Math.max(8, bucket.motion)}%` }}
              />
            </span>
          ))}
          {playhead !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-10"
              style={{ top: y(playhead) }}
            >
              <div className="h-0.5 bg-red-500" />
              <span
                className="
                  absolute right-1 -translate-y-1/2 rounded-full bg-red-600
                  px-1.5 text-[10px] font-semibold text-white tabular-nums
                "
              >
                {clock(shown ?? playhead)}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="
        flex shrink-0 justify-between border-t border-gray-800 p-1
      ">
        <button
          type="button"
          aria-label="Afastar"
          disabled={zoom >= ZOOM_LEVELS.length - 1}
          onClick={() => changeZoom(zoom + 1)}
          className={zoomButton}
        >
          <MagnifyingGlassMinusIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Aproximar"
          disabled={zoom <= 0}
          onClick={() => changeZoom(zoom - 1)}
          className={zoomButton}
        >
          <MagnifyingGlassPlusIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
