import safeEnvGet from "@server/safeEnvGet";

import { z } from "zod";

type MessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "file"; file: { filename: string; file_data: string } }
    >;

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

export async function chatJson<T extends z.ZodTypeAny>(
  systemPrompt: string,
  userContent: MessageContent,
  schema: T,
  schemaName: string,
): Promise<z.infer<T>> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${safeEnvGet("OPEN_ROUTER_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openrouter/auto",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            schema: z.toJSONSchema(schema),
            strict: true,
          },
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `OpenRouter request failed: ${response.status} ${await response.text()}`,
    );
  }
  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content");
  return schema.parse(JSON.parse(content));
}
