import type { statusPlatformRoutes } from "@server/modules/status-platform";

import { treaty } from "@elysia/eden";

export function getStatusPlatformEdenClient() {
  return treaty<typeof statusPlatformRoutes>("", {
    keepDomain: true,
  });
}
