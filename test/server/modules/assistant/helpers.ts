import type { AssistantAction } from "@server/modules/assistant/model";
import type { ToolContext } from "@server/modules/assistant/tools/guard";

import { TEST_USER } from "../../../helpers/auth";

interface RunnableTool {
  function: { name: string; execute: (input: unknown) => Promise<unknown> };
}

export function makeContext(): ToolContext & { actions: AssistantAction[] } {
  return { user: TEST_USER, actions: [], images: [], conversationImages: [] };
}

/** Runs one tool from a tool list by name, as the agent loop would. */
export function runTool(tools: unknown[], name: string, input: unknown = {}) {
  const found = (tools as RunnableTool[]).find((t) => t.function.name === name);
  if (!found) throw new Error(`No tool ${name}`);
  return found.function.execute(input) as Promise<Record<string, unknown>>;
}

/**
 * Placeholder credentials the imported modules read. Always overridden: `bun
 * test` loads `.env`, and real keys must never reach a test (or its output).
 */
export function provideEnv(keys: string[]): () => void {
  const previous = keys.map((key) => process.env[key]);
  for (const key of keys) process.env[key] = "x";
  return () =>
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
}

export const TUYA_ENV = ["TUYA_ACCESS_ID", "TUYA_ACCESS_SECRET"];
