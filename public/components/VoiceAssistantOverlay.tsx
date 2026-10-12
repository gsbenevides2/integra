import React from "react";

import { useGlobalDrawer } from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import {
  ASSISTANT_PAGE_ID,
  useVoiceAssistant,
} from "@public/components/VoiceAssistantContext";
import { Orb, STATE_LABELS } from "@public/components/VoiceAssistantContext/Orb";
import { toolActivity } from "@public/components/VoiceAssistantContext/toolLabels";
import { TypedText } from "@public/components/VoiceAssistantContext/TypedText";
import { TypingDots } from "@public/components/VoiceAssistantContext/TypingDots";

import { XMarkIcon } from "@heroicons/react/24/outline";

/**
 * Shown over any other dashboard while the assistant is active, so the user
 * can watch (say) a lamp change instead of being taken away to the chat.
 */
export function VoiceAssistantOverlay() {
  const { state, hearingSpeech, messages, stop } = useVoiceAssistant();
  const { page } = useGlobalDrawer();
  if (state === "idle" || page === ASSISTANT_PAGE_ID) return null;

  const last = messages.at(-1);
  const reply = last?.role === "assistant" ? last : undefined;
  const text: React.ReactNode =
    state === "listening"
      ? hearingSpeech
        ? "Ouvindo você..."
        : "Pode falar..."
      : reply?.activity
        ? toolActivity(reply.activity)
        : reply?.text
          ? <TypedText key={reply.id} text={reply.text} live={reply.live} />
          : state === "thinking"
            ? <TypingDots />
            : "";

  return (
    <div
      role="status"
      className="
        fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-center gap-3
        rounded-2xl border border-gray-700 bg-gray-900/95 p-3 shadow-xl
        backdrop-blur-sm
      "
    >
      <Orb state={state} onClick={stop} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-mist-400">{STATE_LABELS[state]}</p>
        <div className="line-clamp-3 text-sm text-mist-100">{text}</div>
      </div>
      {reply?.images?.[0] && (
        <img
          src={reply.images[0].url}
          alt="Imagem da resposta"
          className="size-20 shrink-0 rounded-lg object-cover"
        />
      )}
      <IconButton onClick={stop} aria-label="Fechar assistente">
        <XMarkIcon className="size-5" />
      </IconButton>
    </div>
  );
}
