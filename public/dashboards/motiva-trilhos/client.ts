import type { motivaTrilhosRoutes } from "@server/modules/motiva-trilhos";

import { treaty } from "@elysia/eden";

export function getMotivaTrilhosEdenClient() {
  return treaty<typeof motivaTrilhosRoutes>("", {
    keepDomain: true,
  });
}
