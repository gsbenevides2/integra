// Must load first: the dashboards import this module back (cycle).
import "@public/components/GlobalDrawerContext";

import React from "react";

import { GlobalDrawerProvider } from "@public/components/GlobalDrawerContext";
import type { Me } from "@public/components/MeContext";

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { fail, sse, useApi } from "../../../helpers/dash-api";
import { ME_FIXTURE, renderWithMe } from "../../../helpers/me";
import { controlledStream, installVoiceFakes, replyEvents, voice } from "../../../helpers/voice";

afterAll(installVoiceFakes());

const { CHAT_ROUTE_KEY, VoiceAssistantProvider, useVoiceAssistant } = await import(
  "@public/components/VoiceAssistantContext"
);
const { Orb } = await import("@public/components/VoiceAssistantContext/Orb");
const { VoiceAssistantOverlay } = await import("@public/components/VoiceAssistantOverlay");
const { SETTINGS_ROUTE_KEY, voiceAssistantDashboard, VoiceAssistantDashboard } = await import(
  "@public/dashboards/voice-assistant"
);
const { getAssistantEdenClient } = await import("@public/dashboards/voice-assistant/client");

const ALLOWED: Me = { ...ME_FIXTURE, routes: [CHAT_ROUTE_KEY] };
const FULL: Me = {
  ...ME_FIXTURE,
  routes: [CHAT_ROUTE_KEY, "GET /api/assistant/conversations", "POST /api/assistant/uploads"],
};
const CAMERA_IMAGE = {
  key: "assistant/u/camera/c.jpg",
  url: "https://signed/c",
  mediaType: "image/jpeg",
  source: "camera",
  label: "frente",
};
const NOW = new Date("2026-10-11T15:00:00Z").toISOString();
let conversations: unknown = [
  { id: "c1", title: "Luz da sala", updatedAt: NOW, ended: true },
  { id: "c2", title: "Câmera", updatedAt: NOW, ended: false },
];
let deleteReply: unknown = { ok: true };
let chatImages: unknown[] = [];
const CONFIGURER: Me = { ...ME_FIXTURE, routes: [CHAT_ROUTE_KEY, SETTINGS_ROUTE_KEY] };
let config = { wakeWordEnabled: false };
let settings: unknown = { extraInstructions: "Me chame de Gui." };
let saveReply: unknown = { extraInstructions: "" };
let transcripts: string[] = [];
const calls = useApi({
  "GET /api/assistant/config": () => config,
  "GET /api/assistant/settings": () => settings,
  "PUT /api/assistant/settings": () => saveReply,
  "POST /api/assistant/stt": () => ({ text: transcripts.shift() ?? "" }),
  "POST /api/assistant/chat/stream": () =>
    sse(
      replyEvents({
        reply: "Pronto.",
        actions: [
          { tool: "a", ok: true, summary: "Ligou a luz" },
          { tool: "b", ok: false, summary: "Sem permissão" },
        ],
        images: chatImages,
        conversationId: "c2",
        endConversation: false,
      } as never),
    ),
  "GET /api/assistant/conversations": () => conversations,
  "GET /api/assistant/conversations/:id": () => ({
    id: "c2",
    title: "Câmera",
    updatedAt: NOW,
    ended: false,
    messages: [
      { id: "m1", role: "user", text: "como está a frente?", actions: [], images: [], createdAt: NOW },
      { id: "m2", role: "assistant", text: "Portão fechado.", actions: [], images: [CAMERA_IMAGE], createdAt: NOW },
    ],
  }),
  "DELETE /api/assistant/conversations/:id": () => deleteReply,
  "POST /api/assistant/uploads": () => ({
    key: "assistant/u/upload/a.jpg",
    url: "https://signed/a",
    mediaType: "image/jpeg",
    source: "upload",
  }),
  "POST /api/assistant/tts": () => ({}),
  "DELETE /api/assistant/conversation": () => ({ ok: true }),
});

beforeEach(() => {
  voice.reset();
  config = { wakeWordEnabled: false };
  settings = { extraInstructions: "Me chame de Gui." };
  saveReply = { extraInstructions: "" };
  transcripts = [];
  conversations = [
    { id: "c1", title: "Luz da sala", updatedAt: NOW, ended: true },
    { id: "c2", title: "Câmera", updatedAt: NOW, ended: false },
  ];
  deleteReply = { ok: true };
  chatImages = [];
});
afterEach(cleanup);

/** The settings modal's own Cancel (the global confirm dialog has one too). */
const cancelSettings = () =>
  fireEvent.click(
    within(
      screen.getByLabelText("Instruções para a Integra (só valem para você)").parentElement!,
    ).getByText("Cancelar"),
  );
/** Routes the chat stream to a stream the test controls. */
function holdChat() {
  const stream = controlledStream();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) =>
    String(input).includes("/chat/stream") ? stream.response : realFetch(input, init)) as typeof fetch;
  return { ...stream, restore: () => (globalThis.fetch = realFetch) };
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await flush();
  expect(check()).toBe(true);
}

let assistant: ReturnType<typeof useVoiceAssistant>;
function Grab() {
  assistant = useVoiceAssistant();
  return null;
}

const renderApp = (me: Me = ALLOWED, children: React.ReactNode = null) =>
  renderWithMe(
    <VoiceAssistantProvider>
      <Grab />
      {children}
    </VoiceAssistantProvider>,
    me,
  );

describe("voice assistant dashboard", () => {
  test("metadata and Eden client", () => {
    expect(voiceAssistantDashboard.id).toBe("voice-assistant");
    expect(voiceAssistantDashboard.name).toBe("Assistente");
    expect(typeof getAssistantEdenClient().api.assistant.chat.post).toBe("function");
  });

  test("users without access see a permission notice", () => {
    renderApp(ME_FIXTURE, <VoiceAssistantDashboard />);
    expect(screen.getByText("Peça acesso ao assistente para um administrador.")).toBeTruthy();
    expect(screen.queryByText("Nova conversa")).toBeNull();
    expect(screen.queryByLabelText("Minhas preferências")).toBeNull();
  });

  test("opening it starts listening, and the conversation shows replies and actions", async () => {
    renderApp(ALLOWED, <VoiceAssistantDashboard />);
    await until(() => voice.openTaps.length === 1);
    expect(screen.getByText("Ouvindo...")).toBeTruthy();
    expect(screen.getByText("Experimente dizer:")).toBeTruthy();

    await act(async () => voice.feed(0.3, 300));
    expect(screen.getByText("Ouvindo você...")).toBeTruthy();
    transcripts.push("liga a luz");
    await act(async () => voice.feed(0, 1300));
    expect(await screen.findByText("Pronto.")).toBeTruthy();
    expect(screen.getByText("liga a luz")).toBeTruthy();
    expect(screen.getByText("Ligou a luz")).toBeTruthy();
    expect(screen.getByText("Sem permissão")).toBeTruthy();

    // The orb stops whatever is happening...
    fireEvent.click(screen.getByLabelText("Parar"));
    expect(screen.getByText("Pronta")).toBeTruthy();
    // ...and starts listening again when idle.
    fireEvent.click(screen.getByLabelText("Falar com a Integra"));
    await until(() => voice.openTaps.length === 1);

    fireEvent.click(screen.getByLabelText("Nova conversa"));
    await waitFor(() => expect(screen.queryByText("Pronto.")).toBeNull());
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  test("suggestions and the text box send typed messages", async () => {
    renderApp(ALLOWED, <VoiceAssistantDashboard />);
    await until(() => voice.openTaps.length === 1);
    fireEvent.click(screen.getByText("Como está a internet?"));
    expect(await screen.findByText("Pronto.")).toBeTruthy();

    const input = screen.getByLabelText("Mensagem para o assistente") as HTMLInputElement;
    expect((screen.getByLabelText("Enviar") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "apaga tudo" } });
    fireEvent.submit(input.closest("form")!);
    expect(input.value).toBe("");
    expect(await screen.findByText("apaga tudo")).toBeTruthy();
  });

  test("arriving mid-reply does not cut it off, and a failed reply offers a retry", async () => {
    const chat = holdChat();
    let show!: () => void;
    function Later() {
      const [on, setOn] = React.useState(false);
      show = () => setOn(true);
      return on ? <VoiceAssistantDashboard /> : null;
    }
    try {
      renderApp(ALLOWED, <Later />);
      act(() => assistant.sendText("oi"));
      await until(() => assistant.state === "thinking");
      act(() => show());
      await flush();
      expect(assistant.state).toBe("thinking");
      await act(async () => {
        chat.push({ type: "error", message: "O assistente não respondeu" });
        chat.close();
      });
      expect((await screen.findAllByText("O assistente não respondeu")).length).toBeGreaterThan(0);
    } finally {
      chat.restore();
    }
    fireEvent.click(screen.getByText("Tentar de novo"));
    expect(await screen.findByText("Pronto.")).toBeTruthy();
    expect(screen.queryByText("Tentar de novo")).toBeNull();
    expect(screen.getAllByText("oi")).toHaveLength(1);
  });

  test("the wake word switch reflects availability", async () => {
    renderApp(ALLOWED, <VoiceAssistantDashboard />);
    expect(screen.getByText(/Wake word indisponível/)).toBeTruthy();

    cleanup();
    config = { wakeWordEnabled: true };
    const secure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    try {
      renderApp(ALLOWED, <VoiceAssistantDashboard />);
      await waitFor(() => expect(screen.queryByText(/Wake word indisponível/)).toBeNull());
      const toggle = screen.getByRole("switch");
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-checked")).toBe("false");
      act(() => assistant.setWakeEnabled(true));
    } finally {
      if (secure) Object.defineProperty(window, "isSecureContext", secure);
      else delete (window as { isSecureContext?: boolean }).isSecureContext;
    }
  }, 20_000);

  test("the menu opens the assistant from the global drawer", async () => {
    renderApp(ALLOWED, <GlobalDrawerProvider>{null}</GlobalDrawerProvider>);
    // The default page is Tuya; switch to the assistant through the menu.
    fireEvent.click(screen.getAllByText("Assistente")[0]!);
    await until(() => voice.openTaps.length === 1);
    fireEvent.click(screen.getAllByLabelText("Abrir menu").at(-1)!);
  });
});

describe("assistant settings", () => {
  test("users edit their own instructions", async () => {
    renderApp(CONFIGURER, <VoiceAssistantDashboard />);
    fireEvent.click(screen.getByLabelText("Minhas preferências"));
    const textarea = (await screen.findByLabelText(
      "Instruções para a Integra (só valem para você)",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("Me chame de Gui."));
    expect(screen.getByText(/16\/4000 caracteres/)).toBeTruthy();

    fireEvent.change(textarea, { target: { value: "Fale como pirata." } });
    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Preferências salvas")).toBeTruthy();
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ extraInstructions: "Fale como pirata." });
  });

  test("load and save failures are reported, and cancel closes", async () => {
    settings = fail(500);
    saveReply = fail(500);
    renderApp(CONFIGURER, <VoiceAssistantDashboard />);
    fireEvent.click(screen.getByLabelText("Minhas preferências"));
    expect(await screen.findByText("Falha ao carregar suas preferências")).toBeTruthy();
    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Falha ao salvar suas preferências")).toBeTruthy();
    cancelSettings();
  });

  test("closing before the settings load ignores the late reply", async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((r) => (release = r));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("/settings")) await pending;
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      renderApp(CONFIGURER, <VoiceAssistantDashboard />);
      fireEvent.click(screen.getByLabelText("Minhas preferências"));
      cancelSettings();
      release();
      await flush();
      await flush();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("history", () => {
  test("only shows for users with the history grant", () => {
    renderApp(ALLOWED, <VoiceAssistantDashboard />);
    expect(screen.queryByLabelText("Histórico")).toBeNull();
    expect(screen.queryByLabelText("Anexar imagem")).toBeNull();
  });

  test("lists conversations and opens one, with its camera image", async () => {
    renderApp(FULL, <VoiceAssistantDashboard />);
    fireEvent.click(screen.getByLabelText("Histórico"));
    expect(await screen.findByText("Luz da sala")).toBeTruthy();
    fireEvent.click(screen.getByText("Câmera"));
    expect(await screen.findByText("Portão fechado.")).toBeTruthy();
    const photo = screen.getByAltText("Câmera frente") as HTMLImageElement;
    expect(photo.src).toBe("https://signed/c");
    expect(screen.getByText("Câmera frente")).toBeTruthy();
  });

  test("deletes a conversation after confirming, resetting it if it is open", async () => {
    renderApp(FULL, <VoiceAssistantDashboard />);
    // Continue c2 first, so deleting it also starts a new conversation.
    fireEvent.click(screen.getByText("Como está a internet?"));
    expect(await screen.findByText("Pronto.")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Histórico"));
    await screen.findByText("Luz da sala");
    fireEvent.click(screen.getByLabelText("Excluir Câmera"));
    fireEvent.click(await screen.findByText("Excluir", { selector: "button" }));
    await waitFor(() => expect(screen.queryByText("Câmera", { selector: "p" })).toBeNull());
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/assistant/conversations/c2")).toBe(true);
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/assistant/conversation")).toBe(true);

    // Cancelling keeps it; a failed delete is reported.
    fireEvent.click(screen.getByLabelText("Excluir Luz da sala"));
    fireEvent.click(await screen.findByText("Cancelar", { selector: "button" }));
    deleteReply = fail(500);
    fireEvent.click(screen.getByLabelText("Excluir Luz da sala"));
    fireEvent.click(await screen.findByText("Excluir", { selector: "button" }));
    expect(await screen.findByText("Falha ao excluir a conversa")).toBeTruthy();
    expect(screen.getByText("Luz da sala")).toBeTruthy();
  }, 20_000);

  test("shows empty and error states", async () => {
    conversations = [];
    renderApp(FULL, <VoiceAssistantDashboard />);
    fireEvent.click(screen.getByLabelText("Histórico"));
    expect(await screen.findByText("Nenhuma conversa ainda")).toBeTruthy();
    cleanup();

    conversations = fail(500);
    renderApp(FULL, <VoiceAssistantDashboard />);
    fireEvent.click(screen.getByLabelText("Histórico"));
    expect(await screen.findByText("Falha ao carregar o histórico")).toBeTruthy();
  });

  test("shows loading while the list is on its way", async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((r) => (release = r));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
      if (String(input).endsWith("/conversations")) await pending;
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      renderApp(FULL, <VoiceAssistantDashboard />);
      fireEvent.click(screen.getByLabelText("Histórico"));
      expect(await screen.findByText("Carregando...")).toBeTruthy();
    } finally {
      release();
      globalThis.fetch = realFetch;
    }
    expect(await screen.findByText("Luz da sala")).toBeTruthy();
  });
});

describe("attachments", () => {
  test("a picked photo is attached, removable, and sent with the next message", async () => {
    renderApp(FULL, <VoiceAssistantDashboard />);
    const fileInput = screen.getByLabelText("Arquivo de imagem") as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    expect(await screen.findByAltText("Anexo")).toBeTruthy();
    expect(screen.getByPlaceholderText("Pergunte sobre a imagem (ou fale)...")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Remover anexo"));
    expect(screen.queryByAltText("Anexo")).toBeNull();

    fireEvent.change(fileInput, { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    await screen.findByAltText("Anexo");
    chatImages = [{ key: "g", url: "https://signed/g", mediaType: "image/png", source: "generated" }];
    const input = screen.getByLabelText("Mensagem para o assistente");
    fireEvent.change(input, { target: { value: "o que é isso?" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByAltText("Imagem gerada")).toBeTruthy();
    expect(screen.getByAltText("Imagem enviada")).toBeTruthy();
    expect(calls.find((c) => c.path === "/api/assistant/chat/stream")?.body).toMatchObject({
      images: ["assistant/u/upload/a.jpg"],
    });
  });

  test("the button opens the file picker, and an empty pick does nothing", async () => {
    renderApp(FULL, <VoiceAssistantDashboard />);
    const fileInput = screen.getByLabelText("Arquivo de imagem") as HTMLInputElement;
    let clicked = 0;
    fileInput.click = () => void clicked++;
    fireEvent.click(screen.getByLabelText("Anexar imagem"));
    expect(clicked).toBe(1);
    fireEvent.change(fileInput, { target: { files: [] } });
    await flush();
    expect(calls.some((c) => c.path === "/api/assistant/uploads")).toBe(false);
  });

  test("shows a spinner while uploading", async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((r) => (release = r));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("/uploads")) await pending;
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      renderApp(FULL, <VoiceAssistantDashboard />);
      fireEvent.change(screen.getByLabelText("Arquivo de imagem"), {
        target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] },
      });
      await waitFor(() =>
        expect((screen.getByLabelText("Anexar imagem") as HTMLButtonElement).disabled).toBe(true),
      );
    } finally {
      release();
      globalThis.fetch = realFetch;
    }
    expect(await screen.findByAltText("Anexo")).toBeTruthy();
  });
});

describe("VoiceAssistantOverlay", () => {
  test("appears over other dashboards while active, not on the assistant page", async () => {
    // Tuya is the default page, so the overlay shows on top of it.
    renderApp(
      ALLOWED,
      <GlobalDrawerProvider>
        <VoiceAssistantOverlay />
      </GlobalDrawerProvider>,
    );
    expect(screen.queryByRole("status")).toBeNull();

    act(() => assistant.start());
    expect(await screen.findByText("Pode falar...")).toBeTruthy();
    await until(() => voice.openTaps.length === 1);
    await act(async () => voice.feed(0.3, 300));
    expect(screen.getAllByText("Ouvindo você...").length).toBeGreaterThan(0);
    transcripts.push("apaga tudo");
    await act(async () => voice.feed(0, 1300));
    expect(await screen.findByText("Pronto.")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Fechar assistente"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("shows the image of a reply being spoken", async () => {
    chatImages = [CAMERA_IMAGE];
    renderApp(
      ALLOWED,
      <GlobalDrawerProvider>
        <VoiceAssistantOverlay />
      </GlobalDrawerProvider>,
    );
    act(() => assistant.sendText("como está a frente?"));
    const thumb = (await screen.findByAltText("Imagem da resposta")) as HTMLImageElement;
    expect(thumb.src).toBe("https://signed/c");
  });

  test("shows typing dots, then the running tool, then the streamed text", async () => {
    const chat = holdChat();
    try {
      renderApp(
        ALLOWED,
        <GlobalDrawerProvider>
          <VoiceAssistantOverlay />
        </GlobalDrawerProvider>,
      );
      act(() => assistant.sendText("pergunta"));
      expect(await screen.findByText("Pensando...")).toBeTruthy();
      // Thinking dots in the orb and in the overlay text.
      expect(screen.getAllByLabelText("Pensando").length).toBe(2);
      await act(async () => chat.push({ type: "tool", tool: "ver_camera" }));
      expect(await screen.findByText("Olhando a câmera…")).toBeTruthy();
      await act(async () => chat.push({ type: "delta", text: "Vendo agora" }));
      expect(await screen.findByText("Vendo agora")).toBeTruthy();
    } finally {
      chat.restore();
    }
  });
});

describe("markdown replies", () => {
  test("assistant replies render markdown; user messages stay plain text", async () => {
    const markdown = [
      "Hoje você tem:",
      "",
      "- **09:00** reunião",
      "1. item",
      "",
      "> nota",
      "",
      "# Grande",
      "",
      "## Médio",
      "",
      "### Título",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "Veja [o site](https://exemplo.com) e `npm i`.",
      "",
      "```",
      "codigo",
      "```",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "![foto](https://evil.example/x.png)",
    ].join("\n");
    // Opened from history, so the text renders complete (no typing).
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) =>
      String(input).endsWith("/conversations/md")
        ? Response.json({
            id: "md",
            title: "Agenda",
            updatedAt: NOW,
            ended: false,
            messages: [
              { id: "u", role: "user", text: "**minha** agenda", actions: [], images: [], createdAt: NOW },
              { id: "a", role: "assistant", text: markdown, actions: [], images: [], createdAt: NOW },
            ],
          })
        : realFetch(input, init)) as typeof fetch;
    try {
      renderApp(ALLOWED, <VoiceAssistantDashboard />);
      await act(() => assistant.openConversation("md"));
      expect(screen.getByText("**minha** agenda")).toBeTruthy();
      expect(screen.getByText("09:00").tagName).toBe("STRONG");
      expect(screen.getByText("reunião").closest("ul")).toBeTruthy();
      expect(screen.getByText("item").closest("ol")).toBeTruthy();
      expect(screen.getByText("nota").closest("blockquote")).toBeTruthy();
      expect(screen.getByText("Título")).toBeTruthy();
      expect(screen.getByText("Grande").tagName).toBe("P");
      expect(screen.getByText("Médio").tagName).toBe("P");
      expect(screen.getByText("const x = 1;").className).toContain("language-js");
      const link = screen.getByText("o site") as HTMLAnchorElement;
      expect(link.getAttribute("target")).toBe("_blank");
      expect(screen.getByText("npm i").tagName).toBe("CODE");
      expect(screen.getByText("codigo").closest("pre")).toBeTruthy();
      expect(screen.getByText("B").tagName).toBe("TH");
      expect(screen.getByText("2").tagName).toBe("TD");
      // Images written by the model are not loaded.
      expect(document.querySelector('img[src="https://evil.example/x.png"]')).toBeNull();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("streamed replies in the chat", () => {
  test("typing dots, the image placeholder and tool progress", async () => {
    const chat = holdChat();
    try {
      renderApp(ALLOWED, <VoiceAssistantDashboard />);
      await until(() => voice.openTaps.length === 1);
      fireEvent.click(screen.getByText("Como está a internet?"));
      // Orb + reply bubble both show the thinking dots.
      await waitFor(() => expect(screen.getAllByLabelText("Pensando").length).toBe(2));

      await act(async () => chat.push({ type: "tool", tool: "gerar_imagem" }));
      expect(await screen.findByText("Gerando imagem…")).toBeTruthy();
      await act(async () =>
        chat.push({ type: "action", action: { tool: "gerar_imagem", ok: true, summary: "Gerou uma imagem" } }),
      );
      await waitFor(() => expect(screen.queryByText("Gerando imagem…")).toBeNull());

      await act(async () => chat.push({ type: "tool", tool: "status_servidor" }));
      expect(await screen.findByText("Verificando o servidor…")).toBeTruthy();
      await act(async () => chat.push({ type: "tool", tool: "ferramenta_nova" }));
      expect(await screen.findByText("Trabalhando nisso…")).toBeTruthy();
      await act(async () => chat.push({ type: "delta", text: "Tudo certo" }));
      expect(await screen.findByText("Tudo certo")).toBeTruthy();
    } finally {
      chat.restore();
    }
  });
});

describe("Orb", () => {
  test("renders each state with a matching label", () => {
    const onClick = mock();
    const { rerender } = renderWithMe(<Orb state="idle" onClick={onClick} />);
    fireEvent.click(screen.getByLabelText("Falar com a Integra"));
    expect(onClick).toHaveBeenCalled();
    rerender(<Orb state="speaking" size="large" />);
    expect(screen.getByLabelText("Parar").getAttribute("data-state")).toBe("speaking");
  });
});
