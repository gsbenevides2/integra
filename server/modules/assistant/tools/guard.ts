import type { StoredImage } from "@server/db/schema";
import {
  getLogger,
  logWarn,
} from "@server/instrumentation/instrumentLogger";
import {
  jsonValue,
  OPENINFERENCE_SPAN_KIND,
} from "@server/instrumentation/openinference";
import { withSpan } from "@server/instrumentation/withSpan";
import { type AuthUser, hasRouteGrant } from "@server/shared/authz";

import { type ToModelOutputResult,tool } from "@openrouter/agent";
import { SpanKind, trace } from "@opentelemetry/api";
import type { z } from "zod";

import type { AssistantAction, EmitStreamEvent } from "../model";
import { ImageStorage } from "../service/images";

const log = getLogger("assistant");
const tracer = trace.getTracer("assistant");

/** Tool details are persisted with the message; keep one call from bloating it. */
const MAX_DETAIL_STRING = 2000;

/** JSON-safe detail value: inline images become a marker and long strings are cut. */
function detailValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:")) return "[imagem]";
    return value.length > MAX_DETAIL_STRING
      ? `${value.slice(0, MAX_DETAIL_STRING)}…`
      : value;
  }
  if (Array.isArray(value)) return value.map(detailValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, detailValue(item)]),
    );
  }
  return value;
}

/** What every tool gets: who is asking, and where to record what it did. */
export interface ToolContext {
  user: AuthUser;
  actions: AssistantAction[];
  /** Images produced while answering (generated, camera), shown in the reply. */
  images: StoredImage[];
  /** Images of the conversation so far, newest last, for edits ("deixa mais azul"). */
  conversationImages: StoredImage[];
  /** Streams progress (tool start, action, new images) to the browser. */
  emit?: EmitStreamEvent;
}

/** Tools answer failures with this shape so the model can say what went wrong. */
export type ToolError = { error: string };

export const NO_PERMISSION: ToolError = {
  error: "O usuário não tem permissão para isso.",
};

export function isToolError(value: unknown): value is ToolError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ToolError).error === "string"
  );
}

interface GuardedToolConfig<TInput extends z.ZodObject, TOutput> {
  name: string;
  description: string;
  /**
   * Route grants the equivalent HTTP route(s) require. Services are called
   * directly, so the route guard never runs: the tool has to check them itself.
   */
  routeKeys: string[];
  /** True if the tool changes something (device, scene, routine, image cost). */
  write?: boolean;
  inputSchema: TInput;
  execute: (input: z.infer<TInput>) => Promise<TOutput | ToolError>;
  /** One short pt-BR sentence describing a successful call, for the UI. */
  summarize: (input: z.infer<TInput>, output: TOutput) => string;
  /** What the model sees, when it is not just the JSON output (e.g. an image). */
  toModelOutput?: (output: TOutput) => ToModelOutputResult;
}

/**
 * Builds a tool that only runs when the user holds every listed route grant,
 * turns thrown errors into a `ToolError` the model can verbalise, and records
 * the outcome in `ctx.actions`.
 */
export function guardedTool<TInput extends z.ZodObject, TOutput>(
  ctx: ToolContext,
  config: GuardedToolConfig<TInput, TOutput>,
) {
  return tool({
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    execute: async (input: z.infer<TInput>) => {
      ctx.emit?.({ type: "tool", tool: config.name });
      const imagesBefore = ctx.images.length;
      const startedAt = performance.now();
      const result = await withSpan(
        tracer,
        `tool ${config.name}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            [OPENINFERENCE_SPAN_KIND]: "TOOL",
            "tool.name": config.name,
            "tool.description": config.description,
            "input.value": jsonValue(input),
            "input.mime_type": "application/json",
          },
        },
        async (span) => {
          const output = await runGuarded(ctx, config, input);
          span.setAttributes({
            "output.value": jsonValue(output),
            "output.mime_type": "application/json",
          });
          return output;
        },
      );
      const details = {
        description: config.description,
        input: detailValue(input),
        output: detailValue(result),
        durationMs: Math.round(performance.now() - startedAt),
      };
      const action: AssistantAction = isToolError(result)
        ? { tool: config.name, ok: false, summary: result.error, ...details }
        : {
            tool: config.name,
            ok: true,
            summary: config.summarize(input, result),
            ...details,
          };
      ctx.actions.push(action);
      ctx.emit?.({ type: "action", action });
      for (const image of ctx.images.slice(imagesBefore)) {
        ctx.emit?.({ type: "image", image: ImageStorage.view(image) });
      }
      return result;
    },
    ...(config.toModelOutput && {
      toModelOutput: ({ output }: { output: TOutput | ToolError }) =>
        isToolError(output)
          ? { type: "content" as const, value: [{ type: "input_text" as const, text: output.error }] }
          : config.toModelOutput!(output),
    }),
  });
}

async function runGuarded<TInput extends z.ZodObject, TOutput>(
  ctx: ToolContext,
  config: GuardedToolConfig<TInput, TOutput>,
  input: z.infer<TInput>,
): Promise<TOutput | ToolError> {
  try {
    for (const routeKey of config.routeKeys) {
      if (!(await hasRouteGrant(ctx.user.id, routeKey))) return NO_PERMISSION;
    }
    return await config.execute(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn(log, "[assistant] tool failed", {
      "assistant.tool": config.name,
      "error.message": message,
    });
    return { error: `Falha ao executar: ${message}` };
  }
}

/** Lowercase, accent-free and trimmed, so "Luz da Sála " matches "luz da sala". */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a spoken name to one item: an exact (normalised) match wins,
 * otherwise a single partial match in either direction. Ambiguous or missing
 * names come back as a `ToolError` listing what is available.
 */
export function findByName<T extends { name: string }>(
  items: T[],
  query: string,
  what: string,
): T | ToolError {
  const wanted = normalizeName(query);
  const exact = items.find((item) => normalizeName(item.name) === wanted);
  if (exact) return exact;
  const partial = items.filter((item) => {
    const name = normalizeName(item.name);
    return name.includes(wanted) || wanted.includes(name);
  });
  if (partial.length === 1) return partial[0]!;
  const names = (partial.length > 1 ? partial : items).map((i) => i.name);
  const reason =
    partial.length > 1
      ? `Mais de um ${what} corresponde a "${query}"`
      : `Nenhum ${what} chamado "${query}"`;
  return { error: `${reason}. Disponíveis: ${names.join(", ") || "nenhum"}.` };
}
