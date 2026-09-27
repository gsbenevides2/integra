import type { serverMetricsRoutes } from "@server/modules/server-metrics";

import { treaty } from "@elysia/eden";

export function getServerMetricsEdenClient() {
  return treaty<typeof serverMetricsRoutes>("", {
    keepDomain: true,
  });
}
