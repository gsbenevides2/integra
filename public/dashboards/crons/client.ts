import type { cronsRoutes } from "@server/modules/crons";

import { treaty } from "@elysia/eden";

export function getCronsEdenClient() {
  return treaty<typeof cronsRoutes>("", {
    keepDomain: true,
  });
}
