import type { StoredImage } from "@server/db/schema";
import {
  getLogger,
  logInfo,
  logWarn,
} from "@server/instrumentation/instrumentLogger";
import { withSpan } from "@server/instrumentation/withSpan";
import safeEnvGet from "@server/safeEnvGet";
import type { AuthUser } from "@server/shared/authz";

import { type Item, OpenRouter, stepCountIs } from "@openrouter/agent";
import { trace } from "@opentelemetry/api";

import type { AssistantAction, ChatReply, EmitStreamEvent } from "../model";
import { buildTools, type ToolContext } from "../tools";
import { conversationTools } from "../tools/conversation";
import { ConversationService, type StoredMessage } from "./conversation";
import { isFarewell } from "./farewell";
import { ImageStorage } from "./images";
import { AssistantSettingsService } from "./settings";

const tracer = trace.getTracer("assistant");
const log = getLogger("assistant");

/** A fast model with reliable tool calling; override with ASSISTANT_MODEL. */
export const DEFAULT_MODEL = "openai/gpt-5-mini";
/** Upper bound on model round-trips (tool calls) per user utterance. */
export const MAX_STEPS = 6;

const FALLBACK_REPLY = "Desculpe, não consegui responder agora.";

/** Tools that change something in the house or cost money (see tools/*.ts `write`). */
const WRITE_TOOLS = new Set([
  "controlar_dispositivo",
  "controlar_varios_dispositivos",
  "aplicar_cena",
  "executar_rotina",
  "gerar_imagem",
]);

/** Past-tense or future wording for a change, in pt-BR ("apliquei", "vou desligar"). */
const ACTION_CLAIM =
  /\b(apliquei|reapliquei|apaguei|desliguei|liguei|acendi|coloquei|pus|pôs|ajustei|executei|aplicada|aplicado|desligada|desligado|apagada|apagado|vou (ligar|desligar|apagar|acender|aplicar|colocar|ajustar|executar))\b/i;

/**
 * A reply that says a change was made needs a successful write action behind
 * it. Without one, the claim is replaced by an honest failure message.
 */
export function guardActionClaims(reply: string, actions: AssistantAction[]): string {
  if (!ACTION_CLAIM.test(reply)) return reply;
  if (actions.some((action) => action.ok && WRITE_TOOLS.has(action.tool))) return reply;
  const failed = actions.filter((action) => !action.ok).map((action) => action.summary);
  return failed.length > 0
    ? `Não consegui fazer isso: ${failed[0]}`
    : "Não consegui fazer isso agora.";
}

export function buildInstructions(
  user: AuthUser,
  extraInstructions = "",
  now = new Date(),
): string {
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
  const lines = [
    "Você é a Integra, assistente de voz da casa do usuário. Fale sempre em português do Brasil.",
    `Você está falando com ${user.name}. Agora é ${date} (horário de São Paulo).`,
    "Sua resposta aparece no chat e também é falada: responda em uma ou duas frases curtas e naturais.",
    "Pode usar markdown leve quando ajudar a leitura (negrito, listas curtas, como compromissos do dia),",
    "mas sem tabelas grandes, emojis ou URLs. Arredonde números e diga unidades por extenso.",
    "Use as ferramentas para consultar ou controlar a casa; nunca invente estados ou dados.",
    "Em consultas de status, resuma: diga se está tudo bem e cite só o que estiver fora do normal.",
    "Para controlar um dispositivo, use o nome que o usuário falou; se a ferramenta disser que",
    "o nome é ambíguo ou não existe, pergunte qual dos disponíveis ele quis dizer.",
    "Depois de agir, confirme em uma frase o que foi feito.",
    "Só diga que fez algo se a ferramenta tiver concluído a ação; se ela falhar, diga que não conseguiu. Nunca prometa fazer algo depois.",
    "Se a ferramenta disser que não pode mudar nada neste aparelho, diga que aqui você só consegue consultar.",
    "Se a fala não for um pedido para você (trecho de TV ou vídeo, outra pessoa falando, ruído), chame ficar_em_silencio e não responda.",
    "Se o pedido for só uma despedida (tchau, obrigado, até logo, era só isso), chame encerrar_conversa e responda com uma despedida curta. Se o pedido tiver uma ação, execute-a, confirme e então chame encerrar_conversa na mesma resposta.",
    "Não faça perguntas como 'posso ajudar em algo mais?'.",
    "Se uma ferramenta disser que falta permissão, diga isso ao usuário sem tentar contornar.",
    "Se o pedido não tiver relação com a casa ou com as ferramentas, responda brevemente com o que souber.",
    "Você enxerga imagens que o usuário envia. Para saber o que acontece numa câmera de segurança,",
    "use ver_camera e descreva o que vê. Para criar ou editar imagens use gerar_imagem; elas aparecem",
    "na tela, então só diga brevemente que a imagem está pronta, sem descrevê-la em detalhes.",
  ];
  const extra = extraInstructions.trim();
  if (extra) {
    lines.push(
      "\n\nPreferências deste usuário (siga-as, desde que não conflitem com as regras acima):\n" +
        extra,
    );
  }
  return lines.join(" ");
}

/** The user's own instructions; a settings failure must not break chat. */
async function loadExtraInstructions(userId: string): Promise<string> {
  try {
    return (await AssistantSettingsService.get(userId)).extraInstructions;
  } catch (error) {
    logWarn(log, "[assistant] could not load settings", {
      "error.message": error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

export interface ChatRequest {
  text: string;
  conversationId?: string;
  /** Uploaded images (already checked to be the user's). */
  uploads?: StoredImage[];
  /** False when a voice turn's speaker was not verified: read-only. Default true. */
  writeAllowed?: boolean;
}

/** User images inlined for the model, newest first; older ones are text only. */
export const MAX_CONTEXT_IMAGES = 3;

type InputMessage =
  | { role: "assistant"; content: string }
  | {
      role: "user";
      content:
        | string
        | (
            | { type: "input_text"; text: string }
            | { type: "input_image"; detail: "auto"; imageUrl: string }
          )[];
    };

/**
 * The model input: earlier messages plus the new one. Images the user sent in
 * the most recent messages are inlined (data URLs: the bucket is private);
 * images the assistant produced are only mentioned, the model already
 * described them when they were made.
 */
export async function buildInput(
  history: StoredMessage[],
  text: string,
  uploads: StoredImage[],
): Promise<InputMessage[]> {
  const turns = [
    ...history.map((m) => ({ role: m.role, text: m.text, images: m.images })),
    { role: "user" as const, text, images: uploads },
  ];
  const inline = new Set(
    turns
      .filter((turn) => turn.role === "user")
      .flatMap((turn) => turn.images.map((image) => image.key))
      .slice(-MAX_CONTEXT_IMAGES),
  );

  return Promise.all(
    turns.map(async (turn): Promise<InputMessage> => {
      if (turn.role === "assistant") {
        const shown = turn.images.map((i) =>
          i.source === "camera" ? `foto da câmera ${i.label}` : "uma imagem gerada",
        );
        return {
          role: "assistant",
          content: shown.length ? `${turn.text} [Mostrei ${shown.join(", ")}]` : turn.text,
        };
      }
      const images = turn.images.filter((image) => inline.has(image.key));
      if (images.length === 0) return { role: "user", content: turn.text };
      return {
        role: "user",
        content: [
          { type: "input_text", text: turn.text },
          ...(await Promise.all(
            images.map(async (image) => ({
              type: "input_image" as const,
              detail: "auto" as const,
              imageUrl: await ImageStorage.dataUrl(image),
            })),
          )),
        ],
      };
    }),
  );
}

export abstract class AssistantAgent {
  // explicit ctor: bun cannot count an implicit one as covered
  constructor() {}

  /** Answers one message; `emit` streams progress and the reply as it is written. */
  static run(
    user: AuthUser,
    request: ChatRequest,
    emit: EmitStreamEvent = () => {},
  ): Promise<ChatReply> {
    const model = process.env.ASSISTANT_MODEL || DEFAULT_MODEL;
    const { text, uploads = [] } = request;
    return withSpan(
      tracer,
      "assistant.chat",
      { attributes: { "assistant.model": model, "enduser.id": user.id } },
      async (span) => {
        const conversation = await ConversationService.open(
          user.id,
          text,
          request.conversationId,
        );
        emit({ type: "conversation", conversationId: conversation.id });
        const history = await ConversationService.context(conversation.id);
        const ctx: ToolContext = {
          user,
          actions: [],
          images: [],
          conversationImages: [...history.flatMap((m) => m.images), ...uploads],
          emit,
          writeAllowed: request.writeAllowed ?? true,
        };
        let endConversation = false;
        let silenced = false;
        const client = new OpenRouter({
          apiKey: safeEnvGet("OPEN_ROUTER_API_KEY"),
        });
        const extraInstructions = await loadExtraInstructions(user.id);
        const result = client.callModel({
          model,
          instructions: buildInstructions(user, extraInstructions),
          // Plain role/content messages are accepted by the Responses API; the
          // SDK's Item union only models persisted (id-carrying) assistant items.
          input: (await buildInput(history, text, uploads)) as Item[],
          tools: [
            ...buildTools(ctx),
            ...conversationTools(
              () => (endConversation = true),
              () => (silenced = true),
            ),
          ],
          stopWhen: [stepCountIs(MAX_STEPS)],
          // Voice needs a fast answer more than deep deliberation.
          reasoning: { effort: "minimal" },
        });
        // Tools run inside the loop while the text streams out of it.
        for await (const delta of result.getTextStream()) {
          emit({ type: "delta", text: delta });
        }
        if (silenced) {
          // Not for the assistant: nothing is spoken, nothing is stored.
          logInfo(log, "[assistant] stayed silent", { "assistant.model": model });
          const silent: ChatReply = {
            conversationId: conversation.id,
            reply: "",
            actions: [],
            images: [],
            endConversation: false,
            silent: true,
          };
          emit({ type: "done", reply: silent });
          return silent;
        }
        const generated = (await result.getText()).trim() || FALLBACK_REPLY;
        const reply = guardActionClaims(generated, ctx.actions);
        if (reply !== generated) {
          logWarn(log, "[assistant] reply claimed an action without a successful tool call", {
            "assistant.model": model,
          });
        }

        // The model sometimes answers a goodbye without calling the tool. Not
        // when it acted on the request ("valeu, apaga a luz"): more may follow.
        if (ctx.actions.length === 0 && isFarewell(text)) endConversation = true;
        // A failed action keeps the session open, so the user can retry it.
        if (ctx.actions.some((action) => !action.ok)) endConversation = false;
        // A goodbye closes the conversation: the next wake word starts fresh.
        await ConversationService.addTurn(
          conversation,
          [
            { role: "user", text, images: uploads },
            { role: "assistant", text: reply, actions: ctx.actions, images: ctx.images },
          ],
          endConversation,
        );
        span.setAttribute("assistant.conversation_id", conversation.id);
        span.setAttribute("assistant.actions", ctx.actions.length);
        span.setAttribute("assistant.end_conversation", endConversation);
        logInfo(log, "[assistant] answered", {
          "assistant.model": model,
          "assistant.tools": ctx.actions.map((a) => a.tool).join(","),
        });
        const chatReply: ChatReply = {
          conversationId: conversation.id,
          reply,
          actions: ctx.actions,
          images: ctx.images.map((image) => ImageStorage.view(image)),
          endConversation,
        };
        emit({ type: "done", reply: chatReply });
        return chatReply;
      },
    );
  }
}
