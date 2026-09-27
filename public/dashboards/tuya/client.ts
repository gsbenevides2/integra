import type { tuyaRoutes } from "@server/modules/tuya";

import { treaty } from "@elysia/eden";

export function getTuyaEdenClient() {
  return treaty<typeof tuyaRoutes>("", {
    keepDomain: true,
  });
}
