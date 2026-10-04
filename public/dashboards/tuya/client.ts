import type { frigateRoutes } from "@server/modules/frigate";
import type { tuyaRoutes } from "@server/modules/tuya";

import { treaty } from "@elysia/eden";

export function getTuyaEdenClient() {
  return treaty<typeof tuyaRoutes>("", {
    keepDomain: true,
  });
}

export function getFrigateEdenClient() {
  return treaty<typeof frigateRoutes>("", {
    keepDomain: true,
  });
}
