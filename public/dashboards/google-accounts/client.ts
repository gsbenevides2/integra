import type { googleRoutes } from "@server/modules/google";

import { treaty } from "@elysia/eden";

export function getGoogleAccountsEdenClient() {
  return treaty<typeof googleRoutes>("", {
    keepDomain: true,
  });
}
