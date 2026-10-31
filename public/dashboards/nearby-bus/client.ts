import type { nearbyBusRoutes } from "@server/modules/nearby-bus";

import { treaty } from "@elysia/eden";

export function getNearbyBusEdenClient() {
  return treaty<typeof nearbyBusRoutes>("", {
    keepDomain: true,
  });
}
