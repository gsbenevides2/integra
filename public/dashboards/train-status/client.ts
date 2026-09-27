import type { trainStatusRoutes } from "@server/modules/train-status";

import { treaty } from "@elysia/eden";

export function getTrainStatusEdenClient() {
  return treaty<typeof trainStatusRoutes>("", {
    keepDomain: true,
  });
}
