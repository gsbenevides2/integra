import type { Attributes } from "@opentelemetry/api";

/**
 * OpenInference span kinds and attribute keys, as understood by OpenObserve's
 * AI views (https://arize-ai.github.io/openinference/spec/).
 */
export const OPENINFERENCE_SPAN_KIND = "openinference.span.kind";
export type OpenInferenceSpanKind =
  | "AGENT"
  | "CHAIN"
  | "EMBEDDING"
  | "EVALUATOR"
  | "GUARDRAIL"
  | "LLM"
  | "PROMPT"
  | "RERANKER"
  | "RETRIEVER"
  | "TOOL";

/** Long bodies (tool results, prompts) are capped so one span stays readable. */
export const MAX_ATTRIBUTE_CHARS = 100_000;

type JsonObject = Record<string, unknown>;

interface ToolCall {
  id?: string;
  name: string;
  arguments: string;
}

interface OpenInferenceMessage {
  role: string;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

interface TokenUsage {
  prompt?: number;
  completion?: number;
  total?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  cost?: number;
  promptCost?: number;
  completionCost?: number;
}

interface NormalizedResponse {
  model?: string;
  messages: OpenInferenceMessage[];
  usage: TokenUsage;
  finishReason?: string;
}

export interface OpenRouterLlmSpan {
  name: string;
  attributes: Attributes;
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function truncateAttribute(value: string): string {
  return value.length > MAX_ATTRIBUTE_CHARS
    ? `${value.slice(0, MAX_ATTRIBUTE_CHARS)}…[truncated]`
    : value;
}

/** Serializes a value for an OpenInference `*.value` attribute. */
export function jsonValue(value: unknown): string {
  try {
    return truncateAttribute(JSON.stringify(value) ?? String(value));
  } catch {
    return truncateAttribute(String(value));
  }
}

/** One text field for a message, flattening content arrays and marking media. */
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  const parts: string[] = [];
  for (const part of asArray(content)) {
    const item = asObject(part);
    if (!item) continue;
    const text = asString(item.text);
    if (text !== undefined) {
      parts.push(text);
      continue;
    }
    if (asString(item.type)?.includes("image")) parts.push("[image]");
    else if (asString(item.type)?.includes("file") || asString(item.type)?.includes("document")) {
      parts.push("[document]");
    }
  }
  return parts.join("\n");
}

function toolCalls(value: unknown): ToolCall[] | undefined {
  const calls = asArray(value)
    .map((value): ToolCall | undefined => {
      const call = asObject(value);
      const fn = asObject(call?.function);
      const name = asString(fn?.name);
      if (!name) return undefined;
      return {
        id: asString(call?.id),
        name,
        arguments: asString(fn?.arguments) ?? "",
      };
    })
    .filter((call): call is ToolCall => call !== undefined);
  return calls.length > 0 ? calls : undefined;
}

function chatMessage(value: unknown): OpenInferenceMessage | undefined {
  const message = asObject(value);
  const role = asString(message?.role);
  if (!role) return undefined;
  const normalized: OpenInferenceMessage = {
    role,
    content: contentText(message?.content),
  };
  const calls = toolCalls(message?.tool_calls);
  if (calls) normalized.toolCalls = calls;
  const toolCallId = asString(message?.tool_call_id);
  if (toolCallId) normalized.toolCallId = toolCallId;
  return normalized;
}

/**
 * Responses API input items: messages, function calls and function results.
 * Reasoning items carry no user-visible text and are skipped.
 */
function responseInputMessage(value: unknown): OpenInferenceMessage | undefined {
  const item = asObject(value);
  const role = asString(item?.role);
  if (role) {
    return { role, content: contentText(item?.content) };
  }
  const type = asString(item?.type);
  const callId = asString(item?.call_id);
  if (type === "function_call") {
    const name = asString(item?.name) ?? "function";
    return {
      role: "assistant",
      content: "",
      toolCalls: [{ id: callId, name, arguments: asString(item?.arguments) ?? "" }],
    };
  }
  if (type === "function_call_output") {
    return {
      role: "tool",
      content: asString(item?.output) ?? jsonValue(item?.output ?? ""),
      ...(callId && { toolCallId: callId }),
    };
  }
  return undefined;
}

function requestMessages(body: JsonObject): OpenInferenceMessage[] {
  const chat = asArray(body.messages)
    .map(chatMessage)
    .filter((message): message is OpenInferenceMessage => message !== undefined);
  if (chat.length > 0) return chat;

  const messages: OpenInferenceMessage[] = [];
  const instructions = asString(body.instructions);
  if (instructions) messages.push({ role: "system", content: instructions });
  if (typeof body.input === "string") {
    messages.push({ role: "user", content: body.input });
  } else {
    messages.push(
      ...asArray(body.input)
        .map(responseInputMessage)
        .filter((message): message is OpenInferenceMessage => message !== undefined),
    );
  }
  return messages;
}

interface ToolDefinition {
  name: string;
  description?: string;
  schema: unknown;
}

function toolDefinitions(body: JsonObject): ToolDefinition[] {
  const definitions: ToolDefinition[] = [];
  for (const value of asArray(body.tools)) {
    const tool = asObject(value);
    // Responses API tools are flat; Chat Completions nests them under `function`.
    const fn = asObject(tool?.function) ?? tool;
    const name = asString(fn?.name);
    if (!name) continue;
    definitions.push({
      name,
      description: asString(fn?.description),
      schema: fn?.parameters ?? fn,
    });
  }
  return definitions;
}

function usageFromResponses(value: unknown): TokenUsage {
  const usage = asObject(value) ?? {};
  const details = asObject(usage.input_tokens_details) ?? {};
  const completionDetails = asObject(usage.output_tokens_details) ?? {};
  const costDetails = asObject(usage.cost_details) ?? {};
  return {
    prompt: asNumber(usage.input_tokens),
    completion: asNumber(usage.output_tokens),
    total: asNumber(usage.total_tokens),
    cacheRead: asNumber(details.cached_tokens),
    cacheWrite: asNumber(details.cache_write_tokens),
    reasoning: asNumber(completionDetails.reasoning_tokens),
    cost: asNumber(usage.cost),
    promptCost: asNumber(
      costDetails.upstream_inference_input_cost ??
        costDetails.upstream_inference_prompt_cost,
    ),
    completionCost: asNumber(
      costDetails.upstream_inference_output_cost ??
        costDetails.upstream_inference_completions_cost,
    ),
  };
}

function usageFromChat(value: unknown): TokenUsage {
  const usage = asObject(value) ?? {};
  const promptDetails = asObject(usage.prompt_tokens_details) ?? {};
  const completionDetails = asObject(usage.completion_tokens_details) ?? {};
  const costDetails = asObject(usage.cost_details) ?? {};
  return {
    prompt: asNumber(usage.prompt_tokens),
    completion: asNumber(usage.completion_tokens),
    total: asNumber(usage.total_tokens),
    cacheRead: asNumber(promptDetails.cached_tokens),
    cacheWrite: asNumber(promptDetails.cache_write_tokens),
    reasoning: asNumber(completionDetails.reasoning_tokens),
    cost: asNumber(usage.cost),
    promptCost: asNumber(
      costDetails.upstream_inference_prompt_cost ??
        costDetails.upstream_inference_input_cost,
    ),
    completionCost: asNumber(
      costDetails.upstream_inference_completions_cost ??
        costDetails.upstream_inference_output_cost,
    ),
  };
}

function responseOutputMessage(value: unknown): OpenInferenceMessage | undefined {
  const item = asObject(value);
  const type = asString(item?.type);
  if (type === "function_call") {
    const name = asString(item?.name);
    if (!name) return undefined;
    return {
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: asString(item?.call_id),
          name,
          arguments: asString(item?.arguments) ?? "",
        },
      ],
    };
  }
  if (type !== "message") return undefined;
  return { role: asString(item?.role) ?? "assistant", content: contentText(item?.content) };
}

/** Responses reports `status: "completed"`; OpenInference expects `stop`. */
function responsesFinishReason(body: JsonObject): string | undefined {
  const incomplete = asString(asObject(body.incomplete_details)?.reason);
  if (incomplete) return incomplete;
  const status = asString(body.status);
  return status === "completed" ? "stop" : status;
}

function normalizeResponse(body: JsonObject): NormalizedResponse {
  if (Array.isArray(body.output)) {
    return {
      model: asString(body.model),
      messages: asArray(body.output)
        .map(responseOutputMessage)
        .filter((message): message is OpenInferenceMessage => message !== undefined),
      usage: usageFromResponses(body.usage),
      finishReason: responsesFinishReason(body),
    };
  }

  const choice = asObject(asArray(body.choices)[0]);
  const message = chatMessage(choice?.message);
  return {
    model: asString(body.model),
    messages: message ? [message] : [],
    usage: usageFromChat(body.usage),
    finishReason: asString(choice?.finish_reason),
  };
}

function parseJson(value: string): JsonObject | undefined {
  try {
    return asObject(JSON.parse(value));
  } catch {
    return undefined;
  }
}

/** Rebuilds a JSON response from a Server-Sent Events body to normalize it. */
function fromStream(events: JsonObject[]): JsonObject | undefined {
  const completed = events
    .filter((event) => event.type === "response.completed")
    .map((event) => asObject(event.response))
    .filter((response): response is JsonObject => response !== undefined)
    .at(-1);
  if (completed) return completed;

  const chunks = events.filter((event) => asArray(event.choices).length > 0);
  if (chunks.length === 0) return undefined;
  const text = chunks
    .flatMap((event) => asArray(event.choices))
    .map((choice) => asString(asObject(asObject(choice)?.delta)?.content) ?? "")
    .join("");
  const calls = chunks
    .flatMap((event) => asArray(event.choices))
    .flatMap((choice) => asArray(asObject(asObject(choice)?.delta)?.tool_calls));
  const usage = chunks.map((event) => event.usage).find((value) => value !== undefined);
  const lastChoice = asObject(asArray(chunks.at(-1)?.choices)[0]);
  return {
    model: asString(chunks.at(-1)?.model),
    choices: [
      {
        message: { role: "assistant", content: text, ...(calls.length > 0 && { tool_calls: calls }) },
        finish_reason: asString(lastChoice?.finish_reason),
      },
    ],
    ...(usage !== undefined && { usage }),
  };
}

function parseResponse(value: string | undefined): NormalizedResponse | undefined {
  if (!value) return undefined;
  const json = parseJson(value);
  if (json) return normalizeResponse(json);
  const events = value
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => parseJson(line.slice("data:".length).trim()))
    .filter((event): event is JsonObject => event !== undefined);
  const streamed = fromStream(events);
  return streamed ? normalizeResponse(streamed) : undefined;
}

function messageAttributes(
  prefix: string,
  messages: OpenInferenceMessage[],
): Record<string, string> {
  const attributes: Record<string, string> = {};
  messages.forEach((message, index) => {
    attributes[`${prefix}.${index}.message.role`] = message.role;
    attributes[`${prefix}.${index}.message.content`] = message.content;
    if (message.toolCallId) {
      attributes[`${prefix}.${index}.message.tool_call_id`] = message.toolCallId;
    }
    message.toolCalls?.forEach((call, callIndex) => {
      const base = `${prefix}.${index}.message.tool_calls.${callIndex}.tool_call`;
      if (call.id) attributes[`${base}.id`] = call.id;
      attributes[`${base}.function.name`] = call.name;
      attributes[`${base}.function.arguments`] = call.arguments;
    });
  });
  return attributes;
}

function usageAttributes(usage: TokenUsage): Attributes {
  const attributes: Attributes = {};
  const counts: [number | undefined, string][] = [
    // OpenInference shape.
    [usage.prompt, "llm.token_count.prompt"],
    [usage.completion, "llm.token_count.completion"],
    [usage.total, "llm.token_count.total"],
    [usage.cacheRead, "llm.token_count.prompt_details.cache_read"],
    [usage.cacheWrite, "llm.token_count.prompt_details.cache_write"],
    [usage.reasoning, "llm.token_count.completion_details.reasoning"],
    [usage.cost, "llm.cost.total"],
    [usage.promptCost, "llm.cost.prompt"],
    [usage.completionCost, "llm.cost.completion"],
    // GenAI shape: OpenObserve reads cost from here (and keeps a reported cost
    // instead of estimating it from its own price table).
    [usage.prompt, "gen_ai.usage.input_tokens"],
    [usage.completion, "gen_ai.usage.output_tokens"],
    [usage.total, "gen_ai.usage.total_tokens"],
    [usage.cacheRead, "gen_ai.usage.cache_read_tokens"],
    [usage.cacheWrite, "gen_ai.usage.cache_write_tokens"],
    [usage.cost, "gen_ai.usage.cost"],
    [usage.promptCost, "gen_ai.usage.cost.input"],
    [usage.completionCost, "gen_ai.usage.cost.output"],
  ];
  for (const [value, key] of counts) {
    if (value !== undefined) attributes[key] = value;
  }
  return attributes;
}

const PARAMETER_EXCLUSIONS = new Set([
  "messages",
  "input",
  "instructions",
  "tools",
  "session_id",
]);

/** The request fields that describe the call, not its conversation. */
function invocationParameters(body: JsonObject): string {
  const parameters: JsonObject = {};
  for (const [key, value] of Object.entries(body)) {
    if (!PARAMETER_EXCLUSIONS.has(key)) parameters[key] = value;
  }
  return jsonValue(parameters);
}

/**
 * Translates an OpenRouter LLM request/response pair (Responses or Chat
 * Completions, plain JSON or SSE) into an OpenInference `LLM` span. Returns
 * undefined for every other OpenRouter endpoint (audio, images), which are
 * still traced as plain HTTP spans.
 */
export function openRouterLlmSpan(
  url: URL,
  requestBody: string | undefined,
  responseBody: string | undefined,
): OpenRouterLlmSpan | undefined {
  if (url.hostname !== "openrouter.ai") return undefined;
  const chat = url.pathname === "/api/v1/chat/completions";
  if (!chat && url.pathname !== "/api/v1/responses") return undefined;

  const request = requestBody ? parseJson(requestBody) : undefined;
  if (!request) return undefined;
  const response = parseResponse(responseBody);
  const requestModel = asString(request.model);
  const model = response?.model ?? requestModel;
  const sessionId = asString(request.session_id);

  const attributes: Attributes = {
    [OPENINFERENCE_SPAN_KIND]: "LLM",
    "llm.system": "openai",
    "llm.provider": "openrouter",
    "llm.invocation_parameters": invocationParameters(request),
    "input.mime_type": "application/json",
    "output.mime_type": "application/json",
    ...(requestModel && { "llm.request.model_name": requestModel }),
    ...(model && { "llm.model_name": model }),
    ...(response?.model && { "llm.response.model_name": response.model }),
    ...(response?.finishReason && {
      "llm.finish_reason": response.finishReason,
      "gen_ai.response.finish_reasons": [response.finishReason],
    }),
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": "openrouter",
    ...(requestModel && { "gen_ai.request.model": requestModel }),
    ...(model && { "gen_ai.response.model": model }),
    ...messageAttributes("llm.input_messages", requestMessages(request)),
    ...(response ? messageAttributes("llm.output_messages", response.messages) : {}),
    ...(response ? usageAttributes(response.usage) : {}),
    ...(sessionId && {
      "session.id": sessionId,
      "gen_ai.conversation.id": sessionId,
    }),
  };

  toolDefinitions(request).forEach((tool, index) => {
    attributes[`llm.tools.${index}.tool.name`] = tool.name;
    if (tool.description) {
      attributes[`llm.tools.${index}.tool.description`] = tool.description;
    }
    attributes[`llm.tools.${index}.tool.json_schema`] = jsonValue(tool.schema);
  });

  return {
    name: chat ? "OpenRouter Chat Completions" : "OpenRouter Responses",
    attributes,
  };
}