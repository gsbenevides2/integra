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

import type {
  AssistantAction,
  AssistantUsage,
  ChatReply,
  EmitStreamEvent,
  MessageView,
} from "../model";
import { buildTools, type ToolContext } from "../tools";
import { conversationTools } from "../tools/conversation";
import { ACTION_CLAIM, WRITE_TOOLS } from "./claims";
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

/** A stored message as the browser sees it (images become presigned URLs). */
function toMessageView(message: StoredMessage): MessageView {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    actions: message.actions,
    images: message.images.map((image) => ImageStorage.view(image)),
    createdAt: message.createdAt,
  };
}

/** The SDK's aggregate usage, plus the model and wall-clock time for the turn. */
function usageSummary(
  model: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    cost?: number;
    modelCalls: number;
  },
  startedAt: number,
): AssistantUsage {
  return {
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cachedTokens: usage.cachedTokens,
    reasoningTokens: usage.reasoningTokens,
    ...(usage.cost !== undefined && { cost: usage.cost }),
    modelCalls: usage.modelCalls,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

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
        const startedAt = performance.now();
        const conversation = await ConversationService.open(
          user.id,
          text,
          request.conversationId,
        );
        // OpenInference conventions make this run an agent trace in OpenObserve
        // (the model and tool spans below are nested under it).
        span.setAttributes({
          "openinference.span.kind": "AGENT",
          "agent.name": "integra",
          "session.id": conversation.id,
          "gen_ai.conversation.id": conversation.id,
          // OpenObserve's Sessions view shows `user.id`; the internal UUID is
          // meaningless there, so use the login and keep the other ids too.
          "user.id": user.username,
          "user.name": user.name,
          "user.uid": user.uid,
          "user.db_id": user.id,
          "input.value": text,
          "input.mime_type": "text/plain",
        });
        const resumed = !request.conversationId && conversation.persisted;
        const history = await ConversationService.context(conversation.id);
        // A recent conversation is resumed without the caller asking for it: send
        // the messages already in context so the browser can show them and say
        // the model is continuing from a previous conversation.
        emit({
          type: "conversation",
          conversationId: conversation.id,
          resumed,
          ...(resumed &&
            history.length > 0 && {
              title: conversation.title,
              ...(conversation.usage && { usage: conversation.usage }),
              messages: history.map(toMessageView),
            }),
        });
        const ctx: ToolContext = {
          user,
          actions: [],
          images: [],
          conversationImages: [...history.flatMap((m) => m.images), ...uploads],
          emit,
        };
        let endConversation = false;
        let silenced = false;
        const client = new OpenRouter({
          apiKey: safeEnvGet("OPEN_ROUTER_API_KEY"),
        });
        const extraInstructions = await loadExtraInstructions(user.id);
        const result = client.callModel({
          model,
          // Sticky routing for prompt caching: the instructions carry the
          // current time, so the opening messages differ every turn and the
          // default hash-based routing would send each turn to a new provider.
          sessionId: conversation.id,
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
          span.setAttribute("output.value", "");
          const silent: ChatReply = {
            conversationId: conversation.id,
            reply: "",
            actions: [],
            images: [],
            endConversation: false,
            silent: true,
            usage: usageSummary(model, await result.getUsage(), startedAt),
          };
          emit({ type: "done", reply: silent });
          return silent;
        }
        const generated = (await result.getText()).trim() || FALLBACK_REPLY;
        const reply = guardActionClaims(generated, ctx.actions);
        const usage = usageSummary(model, await result.getUsage(), startedAt);
        span.setAttributes({
          "output.value": reply,
          "output.mime_type": "text/plain",
        });
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
        const conversationUsage = await ConversationService.addTurn(
          conversation,
          [
            { role: "user", text, images: uploads },
            {
              role: "assistant",
              text: reply,
              actions: ctx.actions,
              images: ctx.images,
              usage,
            },
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
          usage,
          ...(conversationUsage && { conversationUsage }),
        };
        emit({ type: "done", reply: chatReply });
        return chatReply;
      },
    );
  }
}
