import type { StreamEvent } from "@server/modules/assistant/model";
import * as authz from "@server/shared/authz";

import * as realAgent from "@openrouter/agent";
import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import { TEST_USER } from "../../../helpers/auth";
import { provideEnv, TUYA_ENV } from "./helpers";

afterAll(provideEnv([...TUYA_ENV, "OPEN_ROUTER_API_KEY"]));

interface RunnableTool {
  function: { name: string; execute: (input: unknown) => Promise<unknown> };
}

let requests: Record<string, unknown>[] = [];
let replyText = "Pronto.";
let runTools: ((tools: RunnableTool[]) => Promise<void>) | null = null;

class FakeOpenRouter {
  constructor(public options: unknown) {}
  callModel = (request: Record<string, unknown>) => {
    requests.push(request);
    return {
      // Like the SDK: tools run inside the loop while the text streams out.
      async *getTextStream() {
        await runTools?.(request.tools as RunnableTool[]);
        const half = Math.ceil(replyText.length / 2);
        yield replyText.slice(0, half);
        yield replyText.slice(half);
      },
      getText: async () => replyText,
    };
  };
}

mock.module("@openrouter/agent", () => ({ ...realAgent, OpenRouter: FakeOpenRouter }));
afterAll(() => mock.module("@openrouter/agent", () => realAgent));

const realAssistantAgent = await import("@server/modules/assistant/service/agent");
const { AssistantAgent, buildInput, buildInstructions, DEFAULT_MODEL, MAX_CONTEXT_IMAGES, MAX_STEPS } =
  await import("@server/modules/assistant/service/agent");
const { ConversationService } = await import("@server/modules/assistant/service/conversation");
const { ImageStorage } = await import("@server/modules/assistant/service/images");
const { AssistantSettingsService } = await import("@server/modules/assistant/service/settings");

type Message = Awaited<ReturnType<typeof ConversationService.context>>[number];
const image = (key: string, source: "upload" | "generated" | "camera" = "upload", label?: string) => ({
  key,
  mediaType: "image/png",
  source,
  ...(label && { label }),
});
const message = (role: "user" | "assistant", text: string, images = [] as ReturnType<typeof image>[]) =>
  ({ id: text, conversationId: "c1", role, text, actions: [], images, createdAt: new Date() }) as Message;

const spies: { mockRestore: () => void }[] = [];
 
const spy = (obj: object, key: string): any => {
  const s = spyOn(obj as never, key as never);
  spies.push(s);
  return s;
};
let settings: ReturnType<typeof spyOn>;
let history: Message[];
let addTurn: ReturnType<typeof spyOn>;

beforeEach(() => {
  requests = [];
  replyText = "Pronto.";
  runTools = null;
  history = [];
  delete process.env.ASSISTANT_MODEL;
  settings = spy(AssistantSettingsService, "get").mockResolvedValue({ extraInstructions: "" });
  spy(ConversationService, "open").mockResolvedValue({ id: "c1", persisted: true });
  spy(ConversationService, "context").mockImplementation(async () => history);
  addTurn = spy(ConversationService, "addTurn").mockResolvedValue(undefined);
  spy(ImageStorage, "dataUrl").mockImplementation(async (i: { key: string }) => `data:${i.key}`);
  spy(ImageStorage, "view").mockImplementation((i: object) => ({ ...i, url: "https://signed" }));
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

const tool = (tools: RunnableTool[], name: string) => tools.find((t) => t.function.name === name)!;

describe("buildInstructions", () => {
  test("names the user and the São Paulo time, and explains images", () => {
    const text = buildInstructions(TEST_USER, "", new Date("2026-10-11T15:00:00Z"));
    expect(text).toContain("Test User");
    expect(text).toContain("12:00");
    expect(text).toContain("encerrar_conversa");
    expect(text).toContain("ver_camera");
    expect(text).not.toContain("Preferências");
    expect(buildInstructions(TEST_USER)).toContain("português do Brasil");
  });

  test("appends the user's own instructions", () => {
    const text = buildInstructions(TEST_USER, "  Me chame de Gui.  ");
    expect(text).toContain("Preferências deste usuário");
    expect(text.endsWith("Me chame de Gui.")).toBe(true);
    expect(buildInstructions(TEST_USER, "   ")).not.toContain("Preferências");
  });
});

describe("buildInput", () => {
  test("inlines the newest user images and mentions what the assistant showed", async () => {
    const input = await buildInput(
      [
        message("user", "olha", [image("u1"), image("u2")]),
        message("assistant", "Gerei.", [image("g1", "generated")]),
        message("assistant", "Vi.", [image("c1", "camera", "frente")]),
        message("assistant", "Ok."),
      ],
      "e agora?",
      [image("u3"), image("u4")],
    );
    expect(MAX_CONTEXT_IMAGES).toBe(3);
    expect(input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "olha" },
          { type: "input_image", detail: "auto", imageUrl: "data:u2" },
        ],
      },
      { role: "assistant", content: "Gerei. [Mostrei uma imagem gerada]" },
      { role: "assistant", content: "Vi. [Mostrei foto da câmera frente]" },
      { role: "assistant", content: "Ok." },
      {
        role: "user",
        content: [
          { type: "input_text", text: "e agora?" },
          { type: "input_image", detail: "auto", imageUrl: "data:u3" },
          { type: "input_image", detail: "auto", imageUrl: "data:u4" },
        ],
      },
    ]);
  });

  test("plain text without images", async () => {
    expect(await buildInput([], "oi", [])).toEqual([{ role: "user", content: "oi" }]);
  });
});

describe("AssistantAgent", () => {
  test("answers in the conversation and saves the exchange", async () => {
    new (AssistantAgent as unknown as new () => object)();
    settings.mockResolvedValue({ extraInstructions: "Fale como pirata." });
    history = [message("user", "Oi"), message("assistant", "Olá!")];
    const reply = await AssistantAgent.run(TEST_USER, { text: "E agora?", conversationId: "c1" });
    expect(reply).toEqual({
      conversationId: "c1",
      reply: "Pronto.",
      actions: [],
      images: [],
      endConversation: false,
    });
    expect(ConversationService.open).toHaveBeenCalledWith(TEST_USER.id, "E agora?", "c1");
    expect(settings).toHaveBeenCalledWith(TEST_USER.id);
    expect(requests[0]).toMatchObject({
      model: DEFAULT_MODEL,
      input: [
        { role: "user", content: "Oi" },
        { role: "assistant", content: "Olá!" },
        { role: "user", content: "E agora?" },
      ],
    });
    expect(requests[0]!.instructions).toContain("Fale como pirata.");
    expect((requests[0]!.tools as unknown[]).length).toBeGreaterThan(14);
    expect(requests[0]!.stopWhen).toHaveLength(1);
    expect(MAX_STEPS).toBeGreaterThan(1);
    expect(addTurn).toHaveBeenCalledWith(
      { id: "c1", persisted: true },
      [
        { role: "user", text: "E agora?", images: [] },
        { role: "assistant", text: "Pronto.", actions: [], images: [] },
      ],
      false,
    );
  });

  test("uploads go to the model and to history; produced images come back signed", async () => {
    process.env.ASSISTANT_MODEL = "custom/model";
    replyText = "  ";
    const upload = image("assistant/test-user-id/upload/a.png");
    const reply = await AssistantAgent.run(TEST_USER, { text: "O que é isso?", uploads: [upload] });
    expect(reply.reply).toBe("Desculpe, não consegui responder agora.");
    expect(requests[0]).toMatchObject({ model: "custom/model" });
    expect(requests[0]!.input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "O que é isso?" },
          { type: "input_image", detail: "auto", imageUrl: `data:${upload.key}` },
        ],
      },
    ]);
    expect(addTurn.mock.calls[0]![1][0]).toEqual({ role: "user", text: "O que é isso?", images: [upload] });
  });

  test("returns the actions and images recorded by tools", async () => {
    const { ImageGenerationService } = await import("@server/modules/assistant/service/imageGeneration");
    spy(ImageGenerationService, "generate").mockResolvedValue({ bytes: new Uint8Array([1]), mediaType: "image/png" });
    spy(ImageStorage, "save").mockResolvedValue(image("assistant/test-user-id/generated/g.png", "generated"));
    runTools = async (tools) => {
      const denied = spy(authz, "hasRouteGrant").mockResolvedValue(false);
      await tool(tools, "controlar_dispositivo").function.execute({});
      denied.mockRestore();
      await tool(tools, "gerar_imagem").function.execute({ descricao: "um gato" });
    };
    const reply = await AssistantAgent.run(TEST_USER, { text: "Liga a luz e desenha um gato" });
    expect(reply.actions.map((a) => [a.tool, a.ok])).toEqual([
      ["controlar_dispositivo", false],
      ["gerar_imagem", true],
    ]);
    expect(reply.images).toEqual([
      { ...image("assistant/test-user-id/generated/g.png", "generated"), url: "https://signed" },
    ] as never);
    expect(addTurn.mock.calls[0]![1][1].images).toHaveLength(1);
  });

  test("the encerrar_conversa tool ends (closes) the conversation", async () => {
    replyText = "Até logo!";
    runTools = async (tools) => {
      expect(await tool(tools, "encerrar_conversa").function.execute({})).toEqual({ encerrada: true });
    };
    const reply = await AssistantAgent.run(TEST_USER, { text: "Pronto, pode ir dormir" });
    expect(reply).toMatchObject({ reply: "Até logo!", endConversation: true });
    expect(addTurn.mock.calls[0]![2]).toBe(true);
  });

  test("a clear goodbye ends the conversation even if the model forgets the tool", async () => {
    replyText = "De nada!";
    expect((await AssistantAgent.run(TEST_USER, { text: "Valeu, era só isso" })).endConversation).toBe(true);
  });

  test("a goodbye that came with an action does not end the conversation by itself", async () => {
    runTools = async (tools) => {
      const denied = spy(authz, "hasRouteGrant").mockResolvedValue(false);
      await tool(tools, "controlar_dispositivo").function.execute({});
      denied.mockRestore();
    };
    expect((await AssistantAgent.run(TEST_USER, { text: "Valeu, tchau" })).endConversation).toBe(false);
  });

  test("streams the conversation, tool progress, images, text and the final reply", async () => {
    const { ImageGenerationService } = await import("@server/modules/assistant/service/imageGeneration");
    spy(ImageGenerationService, "generate").mockResolvedValue({ bytes: new Uint8Array([1]), mediaType: "image/png" });
    spy(ImageStorage, "save").mockResolvedValue(image("assistant/test-user-id/generated/g.png", "generated"));
    replyText = "Aqui está.";
    runTools = async (tools) => {
      await tool(tools, "gerar_imagem").function.execute({ descricao: "um gato" });
    };
    const events: StreamEvent[] = [];
    const reply = await AssistantAgent.run(TEST_USER, { text: "Desenha um gato" }, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual([
      "conversation",
      "tool",
      "action",
      "image",
      "delta",
      "delta",
      "done",
    ]);
    expect(events[0]).toEqual({ type: "conversation", conversationId: "c1" });
    expect(events[1]).toEqual({ type: "tool", tool: "gerar_imagem" });
    expect(events[3]).toMatchObject({ type: "image", image: { url: "https://signed" } });
    expect(events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("")).toBe(
      "Aqui está.",
    );
    expect(events.at(-1)).toEqual({ type: "done", reply });
  });

  test("a settings failure does not break the chat", async () => {
    settings.mockRejectedValue(new Error("relation does not exist"));
    expect((await AssistantAgent.run(TEST_USER, { text: "Oi" })).reply).toBe("Pronto.");
    settings.mockRejectedValue("raw");
    expect((await AssistantAgent.run(TEST_USER, { text: "Oi" })).reply).toBe("Pronto.");
    expect(requests[0]!.instructions).not.toContain("Preferências");
  });
});

describe("voice safety", () => {
  const { guardActionClaims } = realAssistantAgent;

  test("stays silent when the model decides the speech was not for it", async () => {
    replyText = "Não deveria falar isso";
    runTools = async (tools) => {
      await tool(tools, "ficar_em_silencio").function.execute({});
    };
    const reply = await AssistantAgent.run(TEST_USER, { text: "Desliga a luz do quarto do Gui" });
    expect(reply).toMatchObject({ reply: "", silent: true, endConversation: false, actions: [] });
    expect(addTurn).not.toHaveBeenCalled();
  });

  test("a claimed change with no successful write action is replaced", async () => {
    replyText = "Pronto — apliquei a cena Normal no Quarto do Gui.";
    const reply = await AssistantAgent.run(TEST_USER, { text: "Coloca no normal" });
    expect(reply.reply).toBe("Não consegui fazer isso agora.");
    expect(addTurn.mock.calls[0]![1][1].text).toBe("Não consegui fazer isso agora.");
  });

  test("a goodbye with a successful action closes the session after the reply", async () => {
    replyText = "Apaguei a luz. Até logo!";
    runTools = async (tools) => {
      const denied = spy(authz, "hasRouteGrant").mockResolvedValue(true);
      await tool(tools, "encerrar_conversa").function.execute({});
      denied.mockRestore();
    };
    const reply = await AssistantAgent.run(TEST_USER, { text: "Valeu, apaga a luz" });
    expect(reply.endConversation).toBe(true);
  });

  test("guardActionClaims keeps replies backed by a successful write tool", () => {
    const ok = [{ tool: "aplicar_cena", ok: true, summary: "Aplicou Normal" }];
    expect(guardActionClaims("Apliquei a cena Normal.", ok)).toBe("Apliquei a cena Normal.");
    expect(guardActionClaims("Apliquei a cena Normal.", [{ tool: "listar_cenas", ok: true, summary: "" }])).toBe(
      "Não consegui fazer isso agora.",
    );
    expect(
      guardActionClaims("Vou desligar a luz.", [{ tool: "controlar_dispositivo", ok: false, summary: "Sem permissão" }]),
    ).toBe("Não consegui fazer isso: Sem permissão");
    expect(guardActionClaims("A luz está ligada, com 24%.", [])).toBe("A luz está ligada, com 24%.");
  });
});
