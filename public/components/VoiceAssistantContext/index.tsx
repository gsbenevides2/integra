import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useMe } from "@public/components/MeContext";
import { useToast } from "@public/components/Toast";
import { getAssistantEdenClient } from "@public/dashboards/voice-assistant/client";

import { streamChat } from "./chatStream";
import { type AssistantImage, uploadImage } from "./imageUpload";
import { resumeAudio } from "./microphone";
import { playChime, speak, type Speaking } from "./speaker";
import { type Listening, listenOnce } from "./transcriber";
import { startWakeWord, type WakeWordEngine } from "./wakeWord";

export type AssistantState = "idle" | "listening" | "thinking" | "speaking";

export interface AssistantAction {
  tool: string;
  ok: boolean;
  summary: string;
}

export type { AssistantImage } from "./imageUpload";

export interface AssistantMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  actions?: AssistantAction[];
  images?: AssistantImage[];
  /** The reply is still being written (typing dots until the first words). */
  pending?: boolean;
  /** The tool running right now, e.g. "gerar_imagem" (shown as progress). */
  activity?: string;
  /** Received live in this session and not typed in yet (see markTyped). */
  live?: boolean;
  /** Why the reply failed; `retry` sends the same message again. */
  error?: string;
  retry?: { text: string; images: AssistantImage[]; userMessageId: number };
}

export interface VoiceAssistantValue {
  /** The user holds the chat route grant. */
  allowed: boolean;
  state: AssistantState;
  /** Speech is being heard right now (while listening). */
  hearingSpeech: boolean;
  messages: AssistantMessage[];
  /** Wake word detection can run here (configured, secure context). */
  wakeAvailable: boolean;
  wakeEnabled: boolean;
  setWakeEnabled: (enabled: boolean) => void;
  /** Starts listening (as if the wake word had been said). */
  start: () => void;
  /** Sends typed text, skipping speech recognition. */
  sendText: (text: string) => void;
  /** Stops whatever is happening and goes back to idle. */
  stop: () => void;
  /** Stops and starts a new conversation (history is kept). */
  reset: () => Promise<void>;
  /** The conversation being continued, if any. */
  conversationId: string | null;
  /** Loads a past conversation so it can be read and continued. */
  openConversation: (id: string) => Promise<void>;
  /** Sends the message behind a failed reply again. */
  retry: (replyId: number) => void;
  /** A live reply finished typing: it shows complete from then on. */
  markTyped: (replyId: number) => void;
  /** Images waiting to go with the next message (typed or spoken). */
  attachments: AssistantImage[];
  uploading: boolean;
  attachImage: (file: Blob) => Promise<void>;
  removeAttachment: (key: string) => void;
}

/** The assistant dashboard's id in the drawer. */
export const ASSISTANT_PAGE_ID = "voice-assistant";
export const CHAT_ROUTE_KEY = "POST /api/assistant/chat";
export const WAKE_PREFERENCE_KEY = "integra.assistant.wake";
/** Mirrors the server: after this long idle, the next message starts a new conversation. */
export const RESUME_WINDOW_MS = 10 * 60 * 1000;
export const LISTEN_TIMEOUTS = {
  /** How long to wait for the first words after the wake word. */
  firstTurnMs: 8000,
  /** After a reply, listen this long for a follow-up without the wake word. */
  followUpMs: 6000,
};

const NOOP_VALUE: VoiceAssistantValue = {
  allowed: false,
  state: "idle",
  hearingSpeech: false,
  messages: [],
  wakeAvailable: false,
  wakeEnabled: false,
  setWakeEnabled: () => {},
  start: () => {},
  sendText: () => {},
  stop: () => {},
  reset: async () => {},
  conversationId: null,
  openConversation: async () => {},
  retry: () => {},
  markTyped: () => {},
  attachments: [],
  uploading: false,
  attachImage: async () => {},
  removeAttachment: () => {},
};

const VoiceAssistantContext = createContext<VoiceAssistantValue>(NOOP_VALUE);

export function useVoiceAssistant(): VoiceAssistantValue {
  return useContext(VoiceAssistantContext);
}

function readWakePreference(): boolean {
  try {
    return localStorage.getItem(WAKE_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function writeWakePreference(enabled: boolean): void {
  try {
    localStorage.setItem(WAKE_PREFERENCE_KEY, String(enabled));
  } catch {
    // Storage blocked: the preference just won't survive a reload.
  }
}

export function VoiceAssistantProvider({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const { showToast } = useToast();
  const allowed = Boolean(me?.routes.includes(CHAT_ROUTE_KEY));

  const [state, setState] = useState<AssistantState>("idle");
  const [hearingSpeech, setHearingSpeech] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [wakeModel, setWakeModel] = useState(false);
  const [wakeEnabled, setWakeEnabledState] = useState(readWakePreference);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [attachments, setAttachmentsState] = useState<AssistantImage[]>([]);
  const [uploading, setUploading] = useState(false);

  const stateRef = useRef<AssistantState>("idle");
  /** Bumped on every new session or stop; stale async steps check it and bail. */
  const sessionRef = useRef(0);
  const listeningRef = useRef<Listening | null>(null);
  const speakingRef = useRef<Speaking | null>(null);
  const nextIdRef = useRef(0);
  /** The last conversation ended with a goodbye; the next one starts clean. */
  const conversationEndedRef = useRef(false);
  // Refs mirror state read inside long-running async sessions.
  const conversationIdRef = useRef<string | null>(null);
  const attachmentsRef = useRef<AssistantImage[]>([]);
  const lastActivityRef = useRef(0);
  const messagesRef = useRef<AssistantMessage[]>([]);
  messagesRef.current = messages;

  const setConversationId = useCallback((id: string | null) => {
    conversationIdRef.current = id;
    setConversationIdState(id);
  }, []);

  const setAttachments = useCallback((next: AssistantImage[]) => {
    attachmentsRef.current = next;
    setAttachmentsState(next);
  }, []);

  const wakeAvailable = allowed && wakeModel && window.isSecureContext;

  const updateState = useCallback((next: AssistantState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const addMessage = useCallback((message: Omit<AssistantMessage, "id">) => {
    const id = nextIdRef.current++;
    setMessages((prev) => [...prev, { ...message, id }]);
    return id;
  }, []);

  const updateMessage = useCallback(
    (id: number, update: (message: AssistantMessage) => AssistantMessage | null) =>
      setMessages((prev) =>
        prev.flatMap((message) => {
          if (message.id !== id) return [message];
          const next = update(message);
          return next ? [next] : [];
        }),
      ),
    [],
  );

  const halt = useCallback(() => {
    sessionRef.current++;
    if (conversationEndedRef.current) {
      conversationEndedRef.current = false;
      setMessages([]);
    }
    listeningRef.current?.cancel();
    listeningRef.current = null;
    speakingRef.current?.stop();
    speakingRef.current = null;
    setHearingSpeech(false);
  }, []);

  const stop = useCallback(() => {
    halt();
    updateState("idle");
  }, [halt, updateState]);

  const fail = useCallback(
    (session: number, error: unknown) => {
      if (session !== sessionRef.current) return;
      showToast(errorMessage(error, "Falha no assistente"), "error");
      stop();
    },
    [showToast, stop],
  );

  /** Listens for one utterance; resolves "" on silence or when superseded. */
  const listen = useCallback(
    async (session: number, timeoutMs: number): Promise<string> => {
      updateState("listening");
      const listening = listenOnce({
        onPhase: (phase) => {
          if (session !== sessionRef.current) return;
          if (phase === "speech") setHearingSpeech(true);
          else updateState("thinking");
        },
        silenceTimeoutMs: timeoutMs,
      });
      listeningRef.current = listening;
      const text = await listening.result;
      if (listeningRef.current === listening) listeningRef.current = null;
      if (session !== sessionRef.current) return "";
      setHearingSpeech(false);
      return text;
    },
    [updateState],
  );

  /**
   * Sends one utterance and speaks the reply. "ended" means the user said
   * goodbye; "superseded" means another session took over meanwhile;
   * "failed" means the reply shows an error with a retry.
   */
  const answer = useCallback(
    async (
      session: number,
      text: string,
      retryImages?: AssistantImage[],
    ): Promise<"continue" | "ended" | "superseded" | "failed"> => {
      // An idle conversation is not resumed: start a new one, on screen too.
      if (conversationIdRef.current && Date.now() - lastActivityRef.current > RESUME_WINDOW_MS) {
        setConversationId(null);
        setMessages([]);
      }
      // Pending attachments go with whatever is said or typed next.
      const images = retryImages ?? attachmentsRef.current;
      if (!retryImages) setAttachments([]);
      const userMessageId = addMessage({ role: "user", text, ...(images.length > 0 && { images }) });
      updateState("thinking");
      // The reply is filled in as the stream arrives: typing, tools, images.
      const replyId = addMessage({ role: "assistant", text: "", pending: true, live: true });
      const live = () => session === sessionRef.current;
      let data;
      try {
        data = await streamChat(
          {
            text,
            ...(conversationIdRef.current && { conversationId: conversationIdRef.current }),
            ...(images.length > 0 && { images: images.map((image) => image.key) }),
          },
          (event) => {
            if (!live()) return;
            if (event.type === "delta") {
              updateMessage(replyId, (m) => ({ ...m, text: m.text + event.text, activity: undefined }));
            } else if (event.type === "tool") {
              updateMessage(replyId, (m) => ({ ...m, activity: event.tool }));
            } else if (event.type === "action") {
              updateMessage(replyId, (m) => ({
                ...m,
                activity: undefined,
                actions: [...(m.actions ?? []), event.action],
              }));
            } else if (event.type === "image") {
              updateMessage(replyId, (m) => ({
                ...m,
                images: [...(m.images ?? []), event.image as AssistantImage],
              }));
            }
          },
        );
      } catch (error) {
        if (live()) {
          // The failure stays in the chat, with a way to send it again (the
          // toast is what shows over other dashboards).
          const message = errorMessage(error, "O assistente não respondeu");
          showToast(message, "error");
          updateMessage(replyId, (m) => ({
            ...m,
            pending: false,
            activity: undefined,
            error: message,
            retry: { text, images, userMessageId },
          }));
          return "failed";
        }
        updateMessage(replyId, () => null);
        return "superseded";
      }
      if (!live()) {
        // Keep whatever was written, but stop showing it as in progress.
        updateMessage(replyId, (m) => (m.text ? { ...m, pending: false, activity: undefined } : null));
        return "superseded";
      }
      setConversationId(data.endConversation ? null : data.conversationId);
      lastActivityRef.current = Date.now();
      updateMessage(replyId, (m) => ({
        id: replyId,
        role: "assistant",
        live: m.live,
        text: data.reply,
        actions: data.actions,
        ...(data.images.length > 0 && { images: data.images as AssistantImage[] }),
      }));

      updateState("speaking");
      const speaking = speak(data.reply);
      speakingRef.current = speaking;
      try {
        await speaking.done;
      } catch (error) {
        // Without a voice the reply is still on screen: carry on listening.
        if (live()) showToast(errorMessage(error, "Falha ao gerar a fala"), "error");
      }
      if (speakingRef.current === speaking) speakingRef.current = null;
      if (session !== sessionRef.current) return "superseded";
      if (data.endConversation) {
        conversationEndedRef.current = true;
        return "ended";
      }
      return "continue";
    },
    [addMessage, setAttachments, setConversationId, showToast, updateMessage, updateState],
  );

  /** Answers, then keeps listening for follow-ups until the user goes quiet. */
  const converse = useCallback(
    async (session: number, firstText: string, firstImages?: AssistantImage[]) => {
      let text = firstText;
      let images = firstImages;
      while (text) {
        const outcome = await answer(session, text, images);
        images = undefined;
        if (outcome === "superseded") return;
        if (outcome === "ended" || outcome === "failed") break;
        text = await listen(session, LISTEN_TIMEOUTS.followUpMs);
        if (session !== sessionRef.current) return;
      }
      updateState("idle");
    },
    [answer, listen, updateState],
  );

  const start = useCallback(() => {
    if (!allowed) return;
    halt();
    const session = sessionRef.current;
    playChime();
    listen(session, LISTEN_TIMEOUTS.firstTurnMs)
      .then((text) => {
        if (session !== sessionRef.current) return;
        return converse(session, text);
      })
      .catch((error: unknown) => fail(session, error));
  }, [allowed, converse, fail, halt, listen]);

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!allowed || !trimmed) return;
      halt();
      const session = sessionRef.current;
      converse(session, trimmed).catch((error: unknown) => fail(session, error));
    },
    [allowed, converse, fail, halt],
  );

  const retry = useCallback(
    (replyId: number) => {
      const payload = messagesRef.current.find((m) => m.id === replyId)?.retry;
      if (!allowed || !payload) return;
      halt();
      const session = sessionRef.current;
      // The failed exchange is sent (and shown) again at the end of the chat.
      setMessages((prev) =>
        prev.filter((m) => m.id !== replyId && m.id !== payload.userMessageId),
      );
      converse(session, payload.text, payload.images).catch((error: unknown) =>
        fail(session, error),
      );
    },
    [allowed, converse, fail, halt],
  );

  const markTyped = useCallback(
    (replyId: number) =>
      setMessages((prev) =>
        prev.some((m) => m.id === replyId && m.live)
          ? prev.map((m) => (m.id === replyId ? { ...m, live: false } : m))
          : prev,
      ),
    [],
  );

  const reset = useCallback(async () => {
    stop();
    setMessages([]);
    setConversationId(null);
    await getAssistantEdenClient().api.assistant.conversation.delete();
  }, [setConversationId, stop]);

  const openConversation = useCallback(
    async (id: string) => {
      stop();
      const session = sessionRef.current;
      const { data, error } = await getAssistantEdenClient()
        .api.assistant.conversations({ id })
        .get();
      // A session started meanwhile (wake word, typing) keeps the screen.
      if (session !== sessionRef.current) return;
      if (error || !data) {
        showToast("Falha ao abrir a conversa", "error");
        return;
      }
      conversationEndedRef.current = false;
      lastActivityRef.current = Date.now();
      setConversationId(data.id);
      setMessages(
        data.messages.map((message) => ({
          id: nextIdRef.current++,
          role: message.role,
          text: message.text,
          actions: message.actions,
          images: message.images as AssistantImage[],
        })),
      );
    },
    [setConversationId, showToast, stop],
  );

  const attachImage = useCallback(
    async (file: Blob) => {
      setUploading(true);
      try {
        const image = await uploadImage(file);
        setAttachments([...attachmentsRef.current, image]);
      } catch (error) {
        showToast(errorMessage(error, "Falha ao enviar a imagem"), "error");
      } finally {
        setUploading(false);
      }
    },
    [setAttachments, showToast],
  );

  const removeAttachment = useCallback(
    (key: string) =>
      setAttachments(attachmentsRef.current.filter((image) => image.key !== key)),
    [setAttachments],
  );

  const setWakeEnabled = useCallback((enabled: boolean) => {
    writeWakePreference(enabled);
    setWakeEnabledState(enabled);
  }, []);

  // Whether the wake word model is deployed comes from the server.
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void getAssistantEdenClient()
      .api.assistant.config.get()
      .then(({ data }) => {
        if (active && data?.wakeWordEnabled) setWakeModel(true);
      });
    return () => {
      active = false;
    };
  }, [allowed]);

  // The wake word starts a session from idle, and interrupts a reply being
  // spoken (barge-in): echo cancellation keeps the assistant's own voice out,
  // and only an utterance that is exactly the wake phrase counts. While
  // listening or thinking it is ignored.
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (!wakeAvailable || !wakeEnabled) return;
    let engine: WakeWordEngine | null = null;
    let active = true;
    let wakeLock: WakeLockSentinel | null = null;

    startWakeWord(() => {
      if (stateRef.current === "idle" || stateRef.current === "speaking") startRef.current();
    })
      .then((started) => {
        if (active) engine = started;
        else void started.stop();
      })
      .catch(() => {
        if (active) showToast("Não foi possível ativar o \"Ei Integra\"", "error");
      });

    // Keep the kiosk screen on while it is listening for the wake word.
    navigator.wakeLock
      ?.request("screen")
      .then((lock) => {
        if (active) wakeLock = lock;
        else void lock.release();
      })
      .catch(() => {});

    window.addEventListener("pointerdown", resumeAudio);
    return () => {
      active = false;
      window.removeEventListener("pointerdown", resumeAudio);
      void engine?.stop();
      void wakeLock?.release();
    };
  }, [showToast, wakeAvailable, wakeEnabled]);

  // Stop any session when the provider goes away.
  useEffect(() => halt, [halt]);

  const value = useMemo<VoiceAssistantValue>(
    () => ({
      allowed,
      state,
      hearingSpeech,
      messages,
      wakeAvailable,
      wakeEnabled,
      setWakeEnabled,
      start,
      sendText,
      stop,
      reset,
      conversationId,
      openConversation,
      retry,
      markTyped,
      attachments,
      uploading,
      attachImage,
      removeAttachment,
    }),
    [
      allowed,
      state,
      hearingSpeech,
      messages,
      wakeAvailable,
      wakeEnabled,
      setWakeEnabled,
      start,
      sendText,
      stop,
      reset,
      conversationId,
      openConversation,
      retry,
      markTyped,
      attachments,
      uploading,
      attachImage,
      removeAttachment,
    ],
  );

  return (
    <VoiceAssistantContext.Provider value={value}>
      {children}
    </VoiceAssistantContext.Provider>
  );
}
