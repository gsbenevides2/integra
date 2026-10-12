import React from "react";

import type { Me } from "@public/components/MeContext";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { fail, sse, useApi } from "../../../helpers/dash-api";
import { ME_FIXTURE, renderWithMe } from "../../../helpers/me";
import {
  controlledStream,
  installVoiceFakes,
  replyEvents,
  replyStreamBody,
  voice,
} from "../../../helpers/voice";

afterAll(installVoiceFakes());

const {
  CHAT_ROUTE_KEY,
  LISTEN_TIMEOUTS,
  useVoiceAssistant,
  VoiceAssistantProvider,
  WAKE_PREFERENCE_KEY,
} = await import("@public/components/VoiceAssistantContext");

type Value = ReturnType<typeof useVoiceAssistant>;
const ALLOWED: Me = { ...ME_FIXTURE, routes: [CHAT_ROUTE_KEY] };
const REPLY = {
  conversationId: "c1",
  reply: "Pronto.",
  actions: [{ tool: "t", ok: true, summary: "Ligou" }],
  images: [] as unknown[],
  endConversation: false,
};
const IMAGE = { key: "assistant/u/upload/a.jpg", url: "https://signed/a", mediaType: "image/jpeg", source: "upload" };

let config = { wakeWordEnabled: false };
let chatReply: unknown = REPLY;
/** Extra stream events sent before the reply text (tools, actions, images). */
let chatEvents: unknown[] = [];
let transcripts: string[] = [];
const calls = useApi({
  "GET /api/assistant/config": () => config,
  "POST /api/assistant/stt": () => ({ text: transcripts.shift() ?? "" }),
  "POST /api/assistant/chat/stream": () =>
    chatReply && typeof chatReply === "object" && "__status" in chatReply
      ? chatReply
      : sse(replyEvents(chatReply as typeof REPLY, chatEvents)),
  "POST /api/assistant/tts": () => ({}),
  "DELETE /api/assistant/conversation": () => ({ ok: true }),
  "POST /api/assistant/uploads": () => uploadReply,
  "GET /api/assistant/conversations/:id": () => detailReply,
});
let uploadReply: unknown = IMAGE;
let detailReply: unknown = {
  id: "old",
  title: "Antiga",
  updatedAt: new Date().toISOString(),
  ended: true,
  messages: [
    { id: "m1", role: "user", text: "oi", actions: [], images: [IMAGE], createdAt: new Date().toISOString() },
    { id: "m2", role: "assistant", text: "Olá!", actions: [], images: [], createdAt: new Date().toISOString() },
  ],
};

const realTimeouts = { ...LISTEN_TIMEOUTS };
const secure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
afterAll(() => {
  Object.assign(LISTEN_TIMEOUTS, realTimeouts);
  if (secure) Object.defineProperty(window, "isSecureContext", secure);
  else delete (window as { isSecureContext?: boolean }).isSecureContext;
});

let wakeLockReleased = 0;
let wakeLockRequest: () => Promise<{ release: () => Promise<void> }>;
beforeEach(() => {
  voice.reset();
  config = { wakeWordEnabled: false };
  chatReply = REPLY;
  chatEvents = [];
  uploadReply = IMAGE;
  transcripts = [];
  Object.assign(LISTEN_TIMEOUTS, { firstTurnMs: 1000, followUpMs: 1000 });
  localStorage.clear();
  wakeLockReleased = 0;
  wakeLockRequest = async () => ({ release: async () => void wakeLockReleased++ });
  Object.defineProperty(navigator, "wakeLock", {
    value: { request: () => wakeLockRequest() },
    configurable: true,
  });
});
afterEach(cleanup);

let value: Value;
function Probe() {
  value = useVoiceAssistant();
  return <span data-testid="state">{value.state}</span>;
}
const renderProvider = (me: Me = ALLOWED) =>
  renderWithMe(
    <VoiceAssistantProvider>
      <Probe />
    </VoiceAssistantProvider>,
    me,
  );
const stateIs = (state: string) =>
  waitFor(() => expect(screen.getByTestId("state").textContent).toBe(state));
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await flush();
  expect(check()).toBe(true);
}
/** Waits for the listening microphone (beyond `baseline` open ones) and says `text`. */
async function say(text: string, baseline = 0) {
  await until(() => voice.openTaps.length > baseline);
  transcripts.push(text);
  await act(async () => voice.utter());
}
const playing = () => voice.sources.filter((s) => s.started && !s.stopped && s.onended);
async function finishSpeaking() {
  await until(() => playing().length > 0);
  await act(async () => voice.finishPlayback());
}

describe("VoiceAssistantProvider", () => {
  test("outside a provider the context is inert", async () => {
    render(<Probe />);
    expect(value.allowed).toBe(false);
    value.setWakeEnabled(true);
    value.start();
    value.sendText("x");
    value.stop();
    await value.reset();
    expect(value.state).toBe("idle");
  });

  test("does nothing for users without the chat grant", async () => {
    renderProvider(ME_FIXTURE);
    await flush();
    act(() => value.start());
    act(() => value.sendText("oi"));
    expect(value.state).toBe("idle");
    expect(calls).toHaveLength(0);
  });

  test("runs a voice turn, a follow-up, and returns to idle on silence", async () => {
    renderProvider();
    act(() => value.start());
    await stateIs("listening");
    expect(voice.tones).toBe(2);
    await until(() => voice.openTaps.length === 1);
    await act(async () => voice.feed(0.3, 300));
    expect(value.hearingSpeech).toBe(true);
    transcripts.push("liga a luz");
    await act(async () => voice.feed(0, 1300));
    await stateIs("speaking");
    expect(value.hearingSpeech).toBe(false);
    expect(value.messages.map((m) => m.text)).toEqual(["liga a luz", "Pronto."]);
    expect(value.messages[1]?.actions?.[0]?.summary).toBe("Ligou");
    expect(calls.find((c) => c.path === "/api/assistant/chat/stream")?.body).toEqual({ text: "liga a luz" });

    await finishSpeaking();
    await stateIs("listening");
    await say("e o quarto?");
    LISTEN_TIMEOUTS.followUpMs = 300;
    await finishSpeaking();
    // Nobody speaks after this reply: the follow-up window closes the session.
    await until(() => voice.openTaps.length === 1);
    await act(async () => voice.feed(0, 400));
    await stateIs("idle");
    expect(value.messages).toHaveLength(4);
  });

  test("a goodbye skips the follow-up, and the next session starts clean", async () => {
    chatReply = { ...REPLY, reply: "Tchau!", endConversation: true };
    renderProvider();
    act(() => value.sendText("obrigado, tchau"));
    await finishSpeaking();
    await stateIs("idle");
    expect(voice.openTaps).toHaveLength(0);
    expect(value.messages.map((m) => m.text)).toEqual(["obrigado, tchau", "Tchau!"]);

    chatReply = REPLY;
    act(() => value.sendText("oi"));
    await stateIs("speaking");
    expect(value.messages.map((m) => m.text)).toEqual(["oi", "Pronto."]);
  });

  test("a silent first turn goes straight back to idle", async () => {
    LISTEN_TIMEOUTS.firstTurnMs = 300;
    renderProvider();
    act(() => value.start());
    await until(() => voice.openTaps.length === 1);
    await act(async () => voice.feed(0, 400));
    await stateIs("idle");
    expect(value.messages).toEqual([]);
  });

  test("typed text skips speech recognition; blank text is ignored", async () => {
    renderProvider();
    act(() => value.sendText("   "));
    expect(value.state).toBe("idle");
    act(() => value.sendText(" status "));
    await stateIs("speaking");
    expect(value.messages[0]?.text).toBe("status");
  });

  test("stop interrupts speech, and reset clears the conversation", async () => {
    renderProvider();
    act(() => value.sendText("oi"));
    await until(() => playing().length > 0);
    const source = playing()[0]!;
    act(() => value.stop());
    expect(value.state).toBe("idle");
    expect(source.stopped).toBe(true);

    await act(() => value.reset());
    expect(value.messages).toEqual([]);
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  test("a new session supersedes one still waiting for the reply", async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((r) => (release = r));
    renderProvider();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("/chat")) {
        await pending;
        return new Response(
          replyStreamBody({ ...REPLY, reply: "velha" }),
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      act(() => value.sendText("primeira"));
      await stateIs("thinking");
      act(() => value.start());
      await stateIs("listening");
      release();
      await flush();
      await flush();
      expect(value.messages.map((m) => m.text)).toEqual(["primeira"]);
      expect(value.state).toBe("listening");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("a session stopped while speaking does not continue", async () => {
    renderProvider();
    act(() => value.sendText("oi"));
    await until(() => playing().length > 0);
    const source = playing()[0]!;
    act(() => value.start()); // a new session interrupts the reply
    await act(async () => source.onended?.());
    await stateIs("listening");
    expect(voice.openTaps).toHaveLength(1);
  });

  test("errors surface as a toast and end the session", async () => {
    chatReply = fail(500);
    renderProvider();
    act(() => value.sendText("oi"));
    expect(await screen.findByText("O assistente não respondeu")).toBeTruthy();
    expect(value.state).toBe("idle");
  });

  test("non-Error failures get a generic toast", async () => {
    renderProvider();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("/tts")) throw "boom";
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      act(() => value.sendText("oi"));
      expect(await screen.findByText("boom")).toBeTruthy();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("a speech failure keeps the reply and carries on listening", async () => {
    renderProvider();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("/tts")) return new Response("", { status: 502 });
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      act(() => value.sendText("oi"));
      expect(await screen.findByText("Falha ao gerar a fala")).toBeTruthy();
      await stateIs("listening");
      expect(value.messages.at(-1)?.text).toBe("Pronto.");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("a microphone error after a typed message is reported", async () => {
    renderProvider();
    act(() => value.sendText("oi"));
    voice.micDenied = true;
    await finishSpeaking();
    expect(await screen.findByText("Permission denied")).toBeTruthy();
    expect(value.state).toBe("idle");
  });

  test("a microphone error during the first turn is reported", async () => {
    voice.micDenied = true;
    renderProvider();
    act(() => value.start());
    expect(await screen.findByText("Permission denied")).toBeTruthy();
    expect(value.state).toBe("idle");
  });

  test("stopping mid-listen ignores the late audio", async () => {
    renderProvider();
    act(() => value.start());
    await until(() => voice.openTaps.length === 1);
    const tap = voice.openTaps[0]!;
    act(() => value.stop());
    await act(async () => tap.port.onmessage?.({ data: new Float32Array(1600).fill(0.3) }));
    expect(value.hearingSpeech).toBe(false);
    expect(value.state).toBe("idle");
  });

  test("speech detected after a newer session started is ignored", async () => {
    renderProvider();
    act(() => value.start());
    await until(() => voice.openTaps.length === 1);
    const stale = voice.openTaps[0]!;
    act(() => value.sendText("oi")); // supersedes the listening session
    await act(async () => {
      for (let i = 0; i < 3; i++) stale.port.onmessage?.({ data: new Float32Array(1600).fill(0.3) });
    });
    expect(value.hearingSpeech).toBe(false);
  });
});

describe("conversations and images", () => {
  const chats = () => calls.filter((c) => c.path === "/api/assistant/chat/stream").map((c) => c.body);

  test("the conversation id is kept between messages and dropped by a goodbye", async () => {
    renderProvider();
    act(() => value.sendText("oi"));
    await stateIs("speaking");
    expect(value.conversationId).toBe("c1");
    act(() => value.sendText("e agora?"));
    await until(() => chats().length === 2);
    expect(chats()[1]).toEqual({ text: "e agora?", conversationId: "c1" });

    chatReply = { ...REPLY, endConversation: true };
    act(() => value.sendText("tchau"));
    await until(() => chats().length === 3);
    await waitFor(() => expect(value.conversationId).toBeNull());
  });

  test("an idle conversation is not resumed", async () => {
    const realNow = Date.now;
    renderProvider();
    act(() => value.sendText("oi"));
    await stateIs("speaking");
    Date.now = () => realNow() + 11 * 60 * 1000;
    try {
      act(() => value.sendText("bom dia"));
      await until(() => chats().length === 2);
      expect(chats()[1]).toEqual({ text: "bom dia" });
      expect(value.messages[0]?.text).toBe("bom dia");
    } finally {
      Date.now = realNow;
    }
  });

  test("attachments go with the next message and show in it", async () => {
    renderProvider();
    await act(() => value.attachImage(new Blob(["x"], { type: "image/gif" })));
    expect(value.attachments).toEqual([IMAGE] as never);
    expect(value.uploading).toBe(false);
    chatReply = { ...REPLY, images: [{ ...IMAGE, key: "g", source: "generated" }] };
    act(() => value.sendText("o que é isso?"));
    await stateIs("speaking");
    expect(chats()[0]).toEqual({ text: "o que é isso?", images: [IMAGE.key] });
    expect(value.attachments).toEqual([]);
    expect(value.messages[0]?.images).toEqual([IMAGE] as never);
    expect(value.messages[1]?.images?.[0]?.source).toBe("generated");
  });

  test("attachments can be removed, and upload errors are reported", async () => {
    renderProvider();
    await act(() => value.attachImage(new Blob(["x"], { type: "image/gif" })));
    act(() => value.removeAttachment(IMAGE.key));
    expect(value.attachments).toEqual([]);

    uploadReply = fail(500);
    await act(() => value.attachImage(new Blob(["x"], { type: "image/gif" })));
    expect(await screen.findByText("Falha ao enviar a imagem")).toBeTruthy();

    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject("offline")) as never;
    try {
      await act(() => value.attachImage(new Blob(["x"], { type: "image/gif" })));
      expect((await screen.findAllByText("Falha ao enviar a imagem")).length).toBe(2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("a past conversation can be opened and continued", async () => {
    renderProvider();
    await act(() => value.openConversation("old"));
    expect(value.conversationId).toBe("old");
    expect(value.messages.map((m) => m.text)).toEqual(["oi", "Olá!"]);
    expect(value.messages[0]?.images).toEqual([IMAGE] as never);
    act(() => value.sendText("continuando"));
    await until(() => chats().length === 1);
    expect(chats()[0]).toEqual({ text: "continuando", conversationId: "old" });

    detailReply = fail(404);
    await act(() => value.openConversation("gone"));
    expect(await screen.findByText("Falha ao abrir a conversa")).toBeTruthy();
  });

  test("reset starts a new conversation", async () => {
    renderProvider();
    act(() => value.sendText("oi"));
    await stateIs("speaking");
    await act(() => value.reset());
    expect(value.conversationId).toBeNull();
  });

  test("a session started while a past conversation loads keeps the screen", async () => {
    renderProvider();
    let release!: () => void;
    const held = detailReply;
    detailReply = new Promise((resolve) => (release = () => resolve(held)));
    try {
      let opening!: Promise<void>;
      act(() => void (opening = value.openConversation("old")));
      act(() => value.sendText("nova"));
      release();
      await act(() => opening);
      expect(value.messages[0]?.text).toBe("nova");
      expect(value.conversationId).not.toBe("old");
    } finally {
      detailReply = held;
    }
  });

  test("the inert default exposes no-op history and attachments", async () => {
    render(<Probe />);
    value.retry(1);
    value.markTyped(1);
    await value.openConversation("x");
    await value.attachImage(new Blob());
    value.removeAttachment("x");
    expect(value.attachments).toEqual([]);
  });
});

describe("streaming replies", () => {
  /** Routes the chat stream to a stream the test controls. */
  function holdChat() {
    const stream = controlledStream();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) =>
      String(input).includes("/chat/stream") ? stream.response : realFetch(input, init)) as typeof fetch;
    return { ...stream, restore: () => (globalThis.fetch = realFetch) };
  }
  const reply = () => value.messages.find((m) => m.role === "assistant");

  test("the reply types in, shows tool progress and images, then settles", async () => {
    const chat = holdChat();
    try {
      renderProvider();
      act(() => value.sendText("desenha um gato"));
      await until(() => reply()?.pending === true);
      expect(reply()?.text).toBe("");

      await act(async () => chat.push({ type: "conversation", conversationId: "c1" }));
      await act(async () => chat.push({ type: "tool", tool: "gerar_imagem" }));
      await until(() => reply()?.activity === "gerar_imagem");
      await act(async () => chat.push({ type: "image", image: IMAGE }));
      await act(async () =>
        chat.push({ type: "action", action: { tool: "gerar_imagem", ok: true, summary: "Gerou uma imagem" } }),
      );
      await until(() => reply()?.activity === undefined && (reply()?.images?.length ?? 0) === 1);
      expect(reply()?.actions?.[0]?.summary).toBe("Gerou uma imagem");

      await act(async () => chat.push({ type: "tool", tool: "ver_camera" }));
      await act(async () => chat.push({ type: "delta", text: "Aqui " }));
      await until(() => reply()?.text === "Aqui " && reply()?.activity === undefined);
      await act(async () => chat.push({ type: "delta", text: "está." }));
      await until(() => reply()?.text === "Aqui está.");

      const final = { ...REPLY, reply: "Aqui está o gato.", images: [IMAGE] };
      await act(async () => {
        chat.push({ type: "done", reply: final });
        chat.close();
      });
      await stateIs("speaking");
      expect(reply()).toMatchObject({ text: "Aqui está o gato.", images: [IMAGE] });
      expect(reply()?.pending).toBeUndefined();
    } finally {
      chat.restore();
    }
  });

  test("a failed reply stays as an error, and retry sends the same message again", async () => {
    chatReply = fail(500);
    renderProvider();
    await act(() => value.attachImage(new Blob(["x"], { type: "image/gif" })));
    act(() => value.sendText("oi"));
    expect(await screen.findByText("O assistente não respondeu")).toBeTruthy();
    await stateIs("idle");
    const failed = reply()!;
    expect(failed).toMatchObject({ error: "O assistente não respondeu", pending: false });
    expect(failed.retry).toMatchObject({ text: "oi", images: [IMAGE] });

    value.retry(-1); // unknown reply: nothing to resend
    chatReply = REPLY;
    act(() => value.retry(failed.id));
    await stateIs("speaking");
    expect(value.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "oi"],
      ["assistant", "Pronto."],
    ]);
    const sent = calls.filter((c) => c.path === "/api/assistant/chat/stream").at(-1);
    expect(sent?.body).toMatchObject({ text: "oi", images: [IMAGE.key] });
    expect(value.attachments).toEqual([]);

    // A failure later in the retried session is reported as usual.
    voice.micDenied = true;
    await finishSpeaking();
    expect(await screen.findByText("Permission denied")).toBeTruthy();
  });

  test("a stream error after a newer session started drops the reply", async () => {
    const chat = holdChat();
    try {
      renderProvider();
      act(() => value.sendText("oi"));
      await until(() => reply()?.pending === true);
      act(() => value.start());
      await act(async () => {
        chat.push({ type: "error", message: "O assistente não respondeu" });
        chat.close();
      });
      await until(() => reply() === undefined);
      expect(screen.queryByText("O assistente não respondeu")).toBeNull();
    } finally {
      chat.restore();
    }
  });

  test("markTyped stops a reply from typing in again", async () => {
    renderProvider();
    act(() => value.sendText("oi"));
    await stateIs("speaking");
    const id = reply()!.id;
    expect(reply()?.live).toBe(true);
    act(() => value.markTyped(id));
    expect(reply()?.live).toBe(false);
    const before = value.messages;
    act(() => value.markTyped(id)); // already typed: no re-render
    expect(value.messages).toBe(before);
  });

  test("a superseded reply keeps what was written, or disappears if empty", async () => {
    const chat = holdChat();
    try {
      renderProvider();
      act(() => value.sendText("primeira"));
      await until(() => reply()?.pending === true);
      await act(async () => chat.push({ type: "delta", text: "Começ" }));
      await until(() => reply()?.text === "Começ");
      act(() => value.start()); // a new session takes over
      await act(async () => {
        chat.push({ type: "delta", text: "ignorado" });
        chat.push({ type: "done", reply: REPLY });
        chat.close();
      });
      await until(() => reply()?.pending === false);
      expect(reply()?.text).toBe("Começ");
    } finally {
      chat.restore();
    }

    cleanup();
    const empty = holdChat();
    try {
      renderProvider();
      act(() => value.sendText("segunda"));
      await until(() => reply()?.pending === true);
      act(() => value.start());
      await act(async () => {
        empty.push({ type: "done", reply: REPLY });
        empty.close();
      });
      await until(() => reply() === undefined);
    } finally {
      empty.restore();
    }
  });
});

describe("wake word", () => {
  test("is unavailable without the model on the server", async () => {
    renderProvider();
    await flush();
    expect(value.wakeAvailable).toBe(false);
    expect(voice.clients).toHaveLength(0);
  });

  test("starts a session on the wake word, only when idle", async () => {
    config = { wakeWordEnabled: true };
    const { unmount } = renderProvider();
    await until(() => voice.recognizers.length === 1);
    expect(value.wakeAvailable).toBe(true);
    expect(value.wakeEnabled).toBe(true);
    const recognizer = voice.recognizers[0]!;

    act(() => window.dispatchEvent(new Event("pointerdown")));
    expect(voice.contexts.some((c) => c.resumed > 0)).toBe(true);

    // Past the wake word's cooldown for every detection below.
    let clock = 0;
    const now = spyOn(performance, "now").mockImplementation(() => (clock += 10_000));
    try {
      await act(async () => recognizer.result("ei integra"));
      await stateIs("listening");
      // The microphone is shared: listening opens no second one.
      expect(voice.openTaps).toHaveLength(1);
      // Ignored while listening...
      await act(async () => recognizer.result("integra"));
      await say("oi");
      await stateIs("speaking");
      // ...but it interrupts a reply being spoken (barge-in).
      const speaking = playing()[0]!;
      await act(async () => recognizer.result("integra"));
      await stateIs("listening");
      expect(speaking.stopped).toBe(true);
    } finally {
      now.mockRestore();
    }

    unmount();
    await flush();
    expect(recognizer.removed).toBe(true);
    expect(wakeLockReleased).toBe(1);
  });

  test("the preference is remembered and turning it off stops the engine", async () => {
    config = { wakeWordEnabled: true };
    renderProvider();
    await until(() => voice.recognizers.length === 1);
    act(() => value.setWakeEnabled(false));
    await until(() => voice.recognizers[0]!.removed);
    expect(localStorage.getItem(WAKE_PREFERENCE_KEY)).toBe("false");
    cleanup();

    renderProvider();
    await flush();
    expect(value.wakeEnabled).toBe(false);
  });

  test("survives blocked storage, a failing engine and a failing wake lock", async () => {
    config = { wakeWordEnabled: true };
    voice.modelError = "404";
    wakeLockRequest = () => Promise.reject(new Error("denied"));
    // Blocked site data makes merely touching localStorage throw.
    const storage = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("SecurityError");
      },
    });
    try {
      renderProvider();
      expect(value.wakeEnabled).toBe(true);
      expect(await screen.findByText('Não foi possível ativar o "Ei Integra"')).toBeTruthy();
      act(() => value.setWakeEnabled(false));
      expect(value.wakeEnabled).toBe(false);
    } finally {
      Object.defineProperty(window, "localStorage", storage);
    }
  });

  test("cleans up an engine and wake lock that finish starting after unmount", async () => {
    config = { wakeWordEnabled: true };
    let grantLock: () => void = () => {};
    wakeLockRequest = () =>
      new Promise((resolve) => {
        grantLock = () => resolve({ release: async () => void wakeLockReleased++ });
      });
    const { unmount } = renderProvider();
    await until(() => voice.clients.length === 1);
    unmount();
    grantLock();
    await until(() => voice.recognizers.length === 1 && voice.recognizers[0]!.removed);
    expect(wakeLockReleased).toBe(1);
  });

  test("works without the Wake Lock API, and ignores a failing engine after unmount", async () => {
    config = { wakeWordEnabled: true };
    Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true });
    voice.modelError = "404";
    const { unmount } = renderProvider();
    await until(() => voice.clients.length === 1);
    unmount();
    await flush();
    expect(screen.queryByText('Não foi possível ativar o "Ei Integra"')).toBeNull();
  });
});
