import {
  jsonValue,
  MAX_ATTRIBUTE_CHARS,
  openRouterLlmSpan,
  truncateAttribute,
} from "@server/instrumentation/openinference";

import { expect, test } from "bun:test";

const url = (path: string, hostname = "openrouter.ai") =>
  new URL(`https://${hostname}${path}`);

test("ignores every other host and OpenRouter endpoint", () => {
  expect(openRouterLlmSpan(url("/api/v1/responses", "example.com"), "{}", "{}")).toBeUndefined();
  expect(openRouterLlmSpan(url("/api/v1/audio/speech"), "{}", "{}")).toBeUndefined();
  expect(openRouterLlmSpan(url("/api/v1/responses"), undefined, undefined)).toBeUndefined();
  expect(openRouterLlmSpan(url("/api/v1/responses"), "not json", undefined)).toBeUndefined();
});

test("maps a Responses API call to an LLM span", () => {
  const request = JSON.stringify({
    model: "openai/gpt-5-mini",
    instructions: "Fale português.",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "quanto é 2+2?" },
          { type: "input_image", image_url: "data:image/png;base64,xx" },
          { type: "document", source: "file" },
          null,
        ],
      },
      { type: "function_call", name: "calcular", arguments: '{"a":1}', call_id: "call-1" },
      { type: "function_call", arguments: "{}" },
      { type: "function_call_output", call_id: "call-1", output: "2" },
      { type: "function_call_output", call_id: "call-2", output: { a: 1 } },
      { type: "reasoning", summary: [] },
    ],
    tools: [
      {
        type: "function",
        name: "calcular",
        description: "Faz contas",
        parameters: { type: "object" },
      },
      { type: "function", name: "sem_parametros" },
    ],
    temperature: 0.2,
    session_id: "conversation-1",
  });
  const response = JSON.stringify({
    model: "openai/gpt-5-mini-2026",
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "4" }],
      },
      { type: "function_call", name: "calcular", arguments: '{"a":2}', call_id: "call-2" },
      { type: "function_call" },
      { type: "reasoning" },
    ],
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 3, cache_write_tokens: 1 },
      output_tokens_details: { reasoning_tokens: 2 },
      cost: 0.01,
      cost_details: {
        upstream_inference_input_cost: 0.004,
        upstream_inference_output_cost: 0.006,
      },
    },
  });

  const span = openRouterLlmSpan(url("/api/v1/responses"), request, response)!;
  expect(span.name).toBe("OpenRouter Responses");
  expect(span.attributes).toMatchObject({
    "openinference.span.kind": "LLM",
    "llm.system": "openai",
    "llm.provider": "openrouter",
    "llm.model_name": "openai/gpt-5-mini-2026",
    "llm.request.model_name": "openai/gpt-5-mini",
    "llm.response.model_name": "openai/gpt-5-mini-2026",
    "llm.finish_reason": "stop",
    "gen_ai.response.finish_reasons": ["stop"],
    "session.id": "conversation-1",
    "gen_ai.conversation.id": "conversation-1",
    "llm.input_messages.0.message.role": "system",
    "llm.input_messages.0.message.content": "Fale português.",
    "llm.input_messages.1.message.role": "user",
    "llm.input_messages.1.message.content": "quanto é 2+2?\n[image]\n[document]",
    "llm.input_messages.2.message.tool_calls.0.tool_call.id": "call-1",
    "llm.input_messages.2.message.tool_calls.0.tool_call.function.name": "calcular",
    "llm.input_messages.3.message.tool_calls.0.tool_call.function.name": "function",
    "llm.input_messages.4.message.role": "tool",
    "llm.input_messages.4.message.tool_call_id": "call-1",
    "llm.input_messages.5.message.content": '{"a":1}',
    "llm.output_messages.0.message.role": "assistant",
    "llm.output_messages.0.message.content": "4",
    "llm.output_messages.1.message.tool_calls.0.tool_call.function.name": "calcular",
    "llm.tools.0.tool.name": "calcular",
    "llm.tools.0.tool.description": "Faz contas",
    "llm.tools.1.tool.name": "sem_parametros",
    "llm.token_count.prompt": 10,
    "llm.token_count.completion": 5,
    "llm.token_count.total": 15,
    "llm.token_count.prompt_details.cache_read": 3,
    "llm.token_count.prompt_details.cache_write": 1,
    "llm.token_count.completion_details.reasoning": 2,
    "llm.cost.total": 0.01,
    "llm.cost.prompt": 0.004,
    "llm.cost.completion": 0.006,
    "gen_ai.usage.input_tokens": 10,
    "gen_ai.usage.output_tokens": 5,
    "gen_ai.usage.total_tokens": 15,
    "gen_ai.usage.cache_read_tokens": 3,
    "gen_ai.usage.cache_write_tokens": 1,
    "gen_ai.usage.cost": 0.01,
    "gen_ai.usage.cost.input": 0.004,
    "gen_ai.usage.cost.output": 0.006,
  });
  expect(span.attributes["llm.invocation_parameters"]).toContain('"temperature":0.2');
  expect(span.attributes["llm.invocation_parameters"]).not.toContain("instructions");
});

test("maps a Chat Completions call, including tool results", () => {
  const request = JSON.stringify({
    model: "openai/gpt-4o",
    messages: [
      { role: "system", content: "Sistema" },
      {
        role: "user",
        content: [
          { type: "text", text: "olha" },
          { type: "image_url", image_url: { url: "https://x/y.png" } },
          { type: "file", file: {} },
        ],
      },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call-1", function: { name: "calcular", arguments: '{"a":1}' } },
          { id: "call-2", function: { arguments: "{}" } },
        ],
      },
      { role: "tool", content: "2", tool_call_id: "call-1" },
      { content: "sem papel" },
      { role: "assistant", content: "sem chamadas", tool_calls: [] },
    ],
    tools: [
      {
        type: "function",
        function: { name: "calcular", description: "Faz contas", parameters: { type: "object" } },
      },
      { type: "function", function: { description: "sem nome" } },
    ],
    max_tokens: 64,
  });
  const response = JSON.stringify({
    model: "openai/gpt-4o-2026",
    choices: [
      {
        message: {
          role: "assistant",
          content: "2",
          tool_calls: [{ id: "call-3", function: { name: "calcular", arguments: "{}" } }],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: {
      prompt_tokens: 6,
      completion_tokens: 2,
      total_tokens: 8,
      prompt_tokens_details: { cached_tokens: 1, cache_write_tokens: 1 },
      completion_tokens_details: { reasoning_tokens: 1 },
      cost: 0.02,
      cost_details: {
        upstream_inference_prompt_cost: 0.01,
        upstream_inference_completions_cost: 0.01,
      },
    },
  });

  const span = openRouterLlmSpan(url("/api/v1/chat/completions"), request, response)!;
  expect(span.name).toBe("OpenRouter Chat Completions");
  expect(span.attributes).toMatchObject({
    "llm.input_messages.1.message.content": "olha\n[image]\n[document]",
    "llm.input_messages.2.message.tool_calls.0.tool_call.function.name": "calcular",
    "llm.input_messages.2.message.tool_calls.0.tool_call.function.arguments": '{"a":1}',
    "llm.input_messages.3.message.role": "tool",
    "llm.input_messages.3.message.tool_call_id": "call-1",
    "llm.output_messages.0.message.tool_calls.0.tool_call.id": "call-3",
    "llm.finish_reason": "tool_calls",
    "llm.token_count.prompt": 6,
    "llm.token_count.completion": 2,
    "llm.token_count.total": 8,
    "llm.token_count.prompt_details.cache_read": 1,
    "llm.token_count.prompt_details.cache_write": 1,
    "llm.token_count.completion_details.reasoning": 1,
    "llm.cost.total": 0.02,
    "llm.cost.prompt": 0.01,
    "llm.cost.completion": 0.01,
    "gen_ai.usage.cost": 0.02,
    "gen_ai.usage.cost.input": 0.01,
    "gen_ai.usage.cost.output": 0.01,
    "gen_ai.usage.total_tokens": 8,
  });
});

test("reads a streamed Responses result from response.completed", () => {
  const request = JSON.stringify({ model: "openai/gpt-5-mini", input: "oi" });
  const response = [
    "event: response.output_text.delta",
    'data: {"type":"response.output_text.delta","delta":"4"}',
    "",
    "data: not-json",
    'data: {"type":"response.completed","response":{"model":"openai/gpt-5-mini","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"4"}]}],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}',
  ].join("\n");

  const span = openRouterLlmSpan(url("/api/v1/responses"), request, response)!;
  expect(span.attributes).toMatchObject({
    "llm.model_name": "openai/gpt-5-mini",
    "llm.output_messages.0.message.content": "4",
    "llm.token_count.total": 2,
  });
});

test("rebuilds a streamed Chat Completions result from chunks", () => {
  const request = JSON.stringify({ model: "openai/gpt-4o", messages: [{ role: "user", content: "oi" }] });
  const response = [
    'data: {"model":"openai/gpt-4o","choices":[{"delta":{"content":"o"}}]}',
    'data: {"model":"openai/gpt-4o","choices":[{"delta":{"content":"i","tool_calls":[{"id":"call-1","function":{"name":"calcular","arguments":"{}"}}]},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}',
    "data: [DONE]",
  ].join("\n");

  const span = openRouterLlmSpan(url("/api/v1/chat/completions"), request, response)!;
  expect(span.attributes).toMatchObject({
    "llm.output_messages.0.message.content": "oi",
    "llm.output_messages.0.message.tool_calls.0.tool_call.id": "call-1",
    "llm.finish_reason": "stop",
    "llm.token_count.total": 2,
  });
});

test("accepts either spelling of the upstream cost breakdown", () => {
  const request = JSON.stringify({ model: "m" });
  const responses = JSON.stringify({
    output: [],
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cost: 0.1,
      cost_details: {
        upstream_inference_prompt_cost: 0.04,
        upstream_inference_completions_cost: 0.06,
      },
    },
  });
  expect(openRouterLlmSpan(url("/api/v1/responses"), request, responses)?.attributes)
    .toMatchObject({
      "gen_ai.usage.cost": 0.1,
      "gen_ai.usage.cost.input": 0.04,
      "gen_ai.usage.cost.output": 0.06,
    });

  const chat = JSON.stringify({
    choices: [],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      cost: 0.2,
      cost_details: {
        upstream_inference_input_cost: 0.1,
        upstream_inference_output_cost: 0.1,
      },
    },
  });
  expect(openRouterLlmSpan(url("/api/v1/chat/completions"), request, chat)?.attributes)
    .toMatchObject({
      "gen_ai.usage.cost": 0.2,
      "gen_ai.usage.cost.input": 0.1,
      "gen_ai.usage.cost.output": 0.1,
    });
});

test("reports an incomplete Responses run with its reason", () => {
  const request = JSON.stringify({ model: "m" });
  const response = JSON.stringify({
    model: "m",
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [],
  });
  expect(openRouterLlmSpan(url("/api/v1/responses"), request, response)?.attributes)
    .toMatchObject({ "llm.finish_reason": "max_output_tokens" });
});

test("tolerates a response with no choices or output", () => {
  const request = JSON.stringify({ model: "m" });
  expect(openRouterLlmSpan(url("/api/v1/responses"), request, undefined)?.attributes)
    .toMatchObject({ "llm.model_name": "m" });
  expect(openRouterLlmSpan(url("/api/v1/responses"), request, "{}")?.attributes).toMatchObject({
    "llm.model_name": "m",
  });
  expect(openRouterLlmSpan(url("/api/v1/responses"), request, "data: [DONE]")?.attributes)
    .toMatchObject({ "llm.model_name": "m" });
  expect(openRouterLlmSpan(url("/api/v1/chat/completions"), request, "{}")?.attributes)
    .toMatchObject({ "llm.model_name": "m" });
});

test("caps stored values and survives circular data", () => {
  expect(truncateAttribute("x".repeat(MAX_ATTRIBUTE_CHARS + 1))).toContain("…[truncated]");
  expect(truncateAttribute("ok")).toBe("ok");
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  expect(jsonValue(circular)).toBe("[object Object]");
  expect(jsonValue(undefined)).toBe("undefined");
});