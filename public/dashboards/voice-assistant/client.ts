import type { assistantRoutes } from "@server/modules/assistant";

import { treaty } from "@elysia/eden";

export function getAssistantEdenClient() {
  return treaty<typeof assistantRoutes>("", {
    keepDomain: true,
  });
}
