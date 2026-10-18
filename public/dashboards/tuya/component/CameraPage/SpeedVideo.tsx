import React, { useEffect, useRef, useState } from "react";

import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";

const MIN = 0.5;
const MAX = 10;
const STEP = 0.5;

type Props = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "ref"> & {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
};

// ponytail: browsers can't play backwards, so speed spans 0.5x–10x, no reverse.
export function SpeedVideo({ videoRef, className, ...props }: Props) {
  const own = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? own;
  const [rate, setRate] = useState(1);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate, ref]);

  const button = `
    cursor-pointer rounded-full p-1.5
    hover:bg-gray-800
    disabled:cursor-not-allowed disabled:opacity-30
  `;

  return (
    <>
      <video
        {...props}
        ref={ref}
        className={className}
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = rate;
          props.onLoadedMetadata?.(e);
        }}
      />
      <div
        className="
          absolute top-2 right-2 flex items-center gap-1 rounded-full
          bg-black/60 px-1 text-sm text-white
        "
      >
        <button
          type="button"
          aria-label="Reduzir velocidade"
          disabled={rate <= MIN}
          onClick={() => setRate((r) => Math.max(MIN, r - STEP))}
          className={button}
        >
          <MinusIcon className="size-4" />
        </button>
        <span className="min-w-9 text-center tabular-nums">{rate}x</span>
        <button
          type="button"
          aria-label="Aumentar velocidade"
          disabled={rate >= MAX}
          onClick={() => setRate((r) => Math.min(MAX, r + STEP))}
          className={button}
        >
          <PlusIcon className="size-4" />
        </button>
      </div>
    </>
  );
}
