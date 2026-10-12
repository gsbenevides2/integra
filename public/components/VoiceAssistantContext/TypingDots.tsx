import React from "react";

const DELAYS_MS = [0, 160, 320];

interface Props {
  /** Dot size classes, e.g. "size-2" (chat) or "size-4" (large orb). */
  dotClassName?: string;
  label?: string;
}

/** Three dots pulsing in turn: the assistant is thinking. */
export function TypingDots({ dotClassName = "size-2", label = "Pensando" }: Props) {
  return (
    <span role="img" aria-label={label} className="
      inline-flex items-center gap-1
    ">
      {DELAYS_MS.map((delay) => (
        <span
          key={delay}
          className={`
            animate-[typing-dot_1.2s_ease-in-out_infinite] rounded-full
            bg-current
            ${dotClassName}
          `}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
