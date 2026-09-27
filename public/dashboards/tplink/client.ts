import type { tplinkRoutes } from "@server/modules/tplink";

import { treaty } from "@elysia/eden";

export function getTplinkEdenClient() {
  return treaty<typeof tplinkRoutes>("", {
    keepDomain: true,
  });
}
