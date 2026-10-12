import type { ChatReply, StreamEvent } from "@server/modules/assistant/model";

export type { ChatReply, StreamEvent };

export interface ChatRequestBody {
  text: string;
  conversationId?: string;
  images?: string[];
}

/**
 * Posts a message to the streaming chat route and calls `onEvent` for every
 * Server-Sent Event (EventSource only does GET, so the body is read by hand).
 * Resolves with the final reply.
 */
export async function streamChat(
  body: ChatRequestBody,
  onEvent: (event: StreamEvent) => void,
): Promise<ChatReply> {
  const response = await fetch("/api/assistant/chat/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) throw new Error("O assistente não respondeu");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply: ChatReply | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      const event = JSON.parse(data) as StreamEvent;
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "done") reply = event.reply;
      onEvent(event);
    }
  }
  if (!reply) throw new Error("O assistente não respondeu");
  return reply;
}
