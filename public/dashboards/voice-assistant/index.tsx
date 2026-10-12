import React, { type FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@public/components/Button";
import {
  type DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useMe } from "@public/components/MeContext";
import { PermissionDenied } from "@public/components/PermissionDenied";
import { Switch } from "@public/components/Switch";
import {
  ASSISTANT_PAGE_ID,
  type AssistantImage,
  type AssistantMessage,
  useVoiceAssistant,
} from "@public/components/VoiceAssistantContext";
import { Orb, STATE_LABELS } from "@public/components/VoiceAssistantContext/Orb";
import { toolActivity } from "@public/components/VoiceAssistantContext/toolLabels";
import { TypedText } from "@public/components/VoiceAssistantContext/TypedText";
import { TypingDots } from "@public/components/VoiceAssistantContext/TypingDots";

import {
  ArrowPathIcon,
  Bars3Icon,
  CheckCircleIcon,
  ClockIcon,
  Cog6ToothIcon,
  ExclamationCircleIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { HistoryDrawer } from "./HistoryDrawer";
import { SettingsModal } from "./SettingsModal";

/** Holders of this route grant can edit their own assistant instructions. */
export const SETTINGS_ROUTE_KEY = "PUT /api/assistant/settings";
export const HISTORY_ROUTE_KEY = "GET /api/assistant/conversations";
export const UPLOAD_ROUTE_KEY = "POST /api/assistant/uploads";

const IMAGE_CAPTIONS: Record<AssistantImage["source"], string> = {
  upload: "Imagem enviada",
  generated: "Imagem gerada",
  camera: "Câmera",
};

/** Thumbnails that open the full image (a presigned URL) in a new tab. */
function MessageImages({ images }: { images: AssistantImage[] }) {
  return (
    <div className="flex max-w-[85%] flex-wrap gap-2">
      {images.map((image) => {
        const caption =
          image.source === "camera" && image.label
            ? `Câmera ${image.label}`
            : IMAGE_CAPTIONS[image.source];
        return (
          <a
            key={image.key}
            href={image.url}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col gap-1"
          >
            <img
              src={image.url}
              alt={caption}
              className="max-h-64 max-w-64 rounded-lg object-cover"
            />
            <span className="text-[11px] text-mist-400">{caption}</span>
          </a>
        );
      })}
    </div>
  );
}

const SUGGESTIONS = [
  "Liga a luz da sala",
  "Como está a internet?",
  "Tem alguma plataforma fora do ar?",
  "Como estão as linhas de trem?",
];

/** What a reply still being written shows: a tool's progress. */
function Activity({ tool }: { tool: string }) {
  if (tool === "gerar_imagem") {
    return (
      <div
        role="status"
        className="
          flex size-48 animate-pulse flex-col items-center justify-center gap-2
          rounded-lg bg-gray-800 text-mist-300
        "
      >
        <PhotoIcon className="size-8" />
        <span className="text-xs">{toolActivity(tool)}</span>
      </div>
    );
  }
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-mist-400">
      <TypingDots dotClassName="size-1.5" label={toolActivity(tool)} />
      {toolActivity(tool)}
    </p>
  );
}

function Message({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";
  const typing = message.pending && !message.text;
  return (
    <div className={`
      flex flex-col gap-1
      ${isUser ? "items-end" : "items-start"}
    `}>
      <div
        className={`
          max-w-[85%] rounded-2xl px-3 py-2 text-sm
          ${isUser ? `bg-mist-900 whitespace-pre-wrap text-mist-100` : `
            bg-gray-800 text-gray-100
          `}
        `}
      >
        {isUser ? (
          message.text
        ) : typing ? (
          <TypingDots />
        ) : (
          <TypedText text={message.text} live={message.live} />
        )}
      </div>
      {message.activity && <Activity tool={message.activity} />}
      {message.images && message.images.length > 0 && (
        <MessageImages images={message.images} />
      )}
      {message.actions && message.actions.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap gap-1">
          {message.actions.map((action, index) => (
            <span
              key={index}
              className={`
                flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]
                ${action.ok ? "bg-emerald-950 text-emerald-300" : `
                  bg-red-950 text-red-300
                `}
              `}
            >
              {action.ok ? (
                <CheckCircleIcon className="size-3" />
              ) : (
                <ExclamationCircleIcon className="size-3" />
              )}
              {action.summary}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function VoiceAssistantDashboard() {
  const globalDrawer = useGlobalDrawer();
  const assistant = useVoiceAssistant();
  const { me } = useMe();
  const canConfigure = Boolean(me?.routes.includes(SETTINGS_ROUTE_KEY));
  const canSeeHistory = Boolean(me?.routes.includes(HISTORY_ROUTE_KEY));
  const canUpload = Boolean(me?.routes.includes(UPLOAD_ROUTE_KEY));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const { allowed, start } = assistant;

  // Opening the dashboard is the same as saying the wake word (once).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!allowed || autoStarted.current) return;
    autoStarted.current = true;
    start();
  }, [allowed, start]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [assistant.messages.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    assistant.sendText(draft);
    setDraft("");
  };

  return (
    <div className="flex h-dvh flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <IconButton
          onClick={() => globalDrawer.setIsOpen(true)}
          aria-label="Abrir menu"
        >
          <Bars3Icon className="size-5" />
        </IconButton>
        <h1 className="flex-1 text-xl">Assistente</h1>
        {allowed && (
          <Button
            variant="secondary"
            onClick={() => void assistant.reset()}
            aria-label="Nova conversa"
          >
            <ArrowPathIcon className="size-4" />
            Nova conversa
          </Button>
        )}
        {allowed && canSeeHistory && (
          <IconButton onClick={() => setHistoryOpen(true)} aria-label="Histórico">
            <ClockIcon className="size-5" />
          </IconButton>
        )}
        {canConfigure && (
          <IconButton
            onClick={() => setSettingsOpen(true)}
            aria-label="Minhas preferências"
          >
            <Cog6ToothIcon className="size-5" />
          </IconButton>
        )}
      </div>
      {allowed && canSeeHistory && (
        <HistoryDrawer isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
      )}
      {canConfigure && (
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {!allowed ? (
        <PermissionDenied label="Peça acesso ao assistente para um administrador." />
      ) : (
        <div className="
          flex min-h-0 flex-1 flex-col gap-3
          max-lg:landscape:flex-row
        ">
          <div className="
            flex flex-col items-center justify-center gap-3 py-2
            max-lg:landscape:w-56
          ">
            <Orb
              state={assistant.state}
              size="large"
              onClick={assistant.state === "idle" ? start : assistant.stop}
            />
            <p className="text-sm text-mist-300">{STATE_LABELS[assistant.state]}</p>
            <Switch
              checked={assistant.wakeAvailable && assistant.wakeEnabled}
              onChange={assistant.setWakeEnabled}
              disabled={!assistant.wakeAvailable}
              label='Ouvir "Ei Integra"'
            />
            {!assistant.wakeAvailable && (
              <p className="max-w-56 text-center text-[11px] text-mist-500">
                Wake word indisponível: baixe o modelo de voz com
                bun run assistant:model (veja docs/assistant.md).
              </p>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="
              flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-md
              bg-gray-900 p-3
            ">
              {assistant.messages.length === 0 ? (
                <div className="
                  flex flex-1 flex-col items-center justify-center gap-2
                  text-center
                ">
                  <MicrophoneIcon className="size-8 text-mist-500" />
                  <p className="text-sm text-mist-300">Experimente dizer:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => assistant.sendText(suggestion)}
                        className="
                          cursor-pointer rounded-full bg-gray-800 px-3 py-1
                          text-xs text-mist-200
                          hover:bg-gray-700
                        "
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                assistant.messages.map((message) => (
                  <Message key={message.id} message={message} />
                ))
              )}
              {assistant.state === "listening" && assistant.hearingSpeech && (
                <p className="self-end text-sm text-mist-400 italic">
                  Ouvindo você...
                </p>
              )}
              <div ref={endRef} />
            </div>
            {assistant.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {assistant.attachments.map((image) => (
                  <div key={image.key} className="relative">
                    <img
                      src={image.url}
                      alt="Anexo"
                      className="size-16 rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => assistant.removeAttachment(image.key)}
                      aria-label="Remover anexo"
                      className="
                        absolute -top-1 -right-1 cursor-pointer rounded-full
                        bg-gray-950 p-0.5
                      "
                    >
                      <XMarkIcon className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="flex gap-2">
              {canUpload && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    aria-label="Arquivo de imagem"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void assistant.attachImage(file);
                    }}
                  />
                  <IconButton
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={assistant.uploading}
                    aria-label="Anexar imagem"
                  >
                    {assistant.uploading ? (
                      <span className="
                        block size-5 animate-spin rounded-full border-2
                        border-current border-t-transparent
                      " />
                    ) : (
                      <PhotoIcon className="size-5" />
                    )}
                  </IconButton>
                </>
              )}
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  assistant.attachments.length > 0
                    ? "Pergunte sobre a imagem (ou fale)..."
                    : "Ou digite aqui..."
                }
                aria-label="Mensagem para o assistente"
                className="
                  min-w-0 flex-1 rounded-md border border-mist-600 bg-gray-900
                  p-2 text-sm outline-0
                  focus:border-mist-300
                "
              />
              <IconButton type="submit" aria-label="Enviar" disabled={!draft.trim()}>
                <PaperAirplaneIcon className="size-5" />
              </IconButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export const voiceAssistantDashboard: DashboardData = {
  id: ASSISTANT_PAGE_ID,
  name: "Assistente",
  icon: MicrophoneIcon,
  content: VoiceAssistantDashboard,
};
