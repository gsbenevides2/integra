import { streamChat } from "@public/components/VoiceAssistantContext/chatStream";

import { afterEach, describe, expect, test } from "bun:test";

const REPLY = { conversationId: "c1", reply: "Oi!", actions: [], images: [], endConversation: false };
const realFetch = globalThis.fetch;
let sent: { url: string; body: unknown }[] = [];

/** Serves the given raw chunks as the SSE body, one read() each. */
function serve(chunks: string[], init: ResponseInit = {}) {
  globalThis.fetch = (async (url: string, request: RequestInit) => {
    sent.push({ url, body: JSON.parse(request.body as string) });
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" }, ...init });
  }) as typeof fetch;
}
const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;

afterEach(() => {
  globalThis.fetch = realFetch;
  sent = [];
});

describe("streamChat", () => {
  test("parses frames split across chunks and several per chunk", async () => {
    const events: string[] = [];
    const all =
      frame({ type: "conversation", conversationId: "c1" }) +
      ": keep-alive comment\n\n" +
      frame({ type: "delta", text: "O" }) +
      frame({ type: "delta", text: "i!" }) +
      frame({ type: "done", reply: REPLY });
    serve([all.slice(0, 30), all.slice(30, 75), all.slice(75)]);
    const reply = await streamChat({ text: "oi" }, (event) => events.push(event.type));
    expect(reply).toEqual(REPLY);
    expect(events).toEqual(["conversation", "delta", "delta", "done"]);
    expect(sent[0]).toEqual({ url: "/api/assistant/chat/stream", body: { text: "oi" } });
  });

  test("an error event rejects with its message", async () => {
    serve([frame({ type: "delta", text: "x" }), frame({ type: "error", message: "caiu" })]);
    await expect(streamChat({ text: "oi" }, () => {})).rejects.toThrow("caiu");
  });

  test("a failed request or a stream without a final reply rejects", async () => {
    serve([], { status: 500 });
    await expect(streamChat({ text: "oi" }, () => {})).rejects.toThrow("O assistente não respondeu");
    serve([frame({ type: "delta", text: "x" })]);
    await expect(streamChat({ text: "oi" }, () => {})).rejects.toThrow("O assistente não respondeu");
  });
});
