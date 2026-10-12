import React from "react";

import { MicrophoneIcon } from "@heroicons/react/24/outline";

import type { AssistantState } from ".";
import { TypingDots } from "./TypingDots";

export const STATE_LABELS: Record<AssistantState, string> = {
  idle: "Pronta",
  listening: "Ouvindo...",
  thinking: "Pensando...",
  speaking: "Falando...",
};

const STATE_CLASSES: Record<AssistantState, string> = {
  idle: "bg-mist-900 text-mist-300",
  listening: "bg-blue-600 text-white animate-pulse",
  thinking: "bg-violet-700 text-white",
  speaking: "bg-emerald-600 text-white animate-pulse",
};

interface Props {
  state: AssistantState;
  size?: "small" | "large";
  onClick?: () => void;
}

/** The assistant's state as a coloured, animated circle. */
export function Orb({ state, size = "small", onClick }: Props) {
  const sizeClasses = size === "large" ? "size-32 p-8" : "size-12 p-3";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={state === "idle" ? "Falar com a Integra" : "Parar"}
      data-state={state}
      className={`
        flex shrink-0 cursor-pointer items-center justify-center rounded-full
        transition-colors
        ${sizeClasses}
        ${STATE_CLASSES[state]}
      `}
    >
      {state === "thinking" ? (
        <TypingDots dotClassName={size === "large" ? "size-4" : "size-2"} />
      ) : (
        <MicrophoneIcon className="size-full" />
      )}
    </button>
  );
}
