import type { birthdayRoutes } from "@server/modules/birthday";

import { treaty } from "@elysia/eden";

export function getBirthdayEdenClient() {
  return treaty<typeof birthdayRoutes>("", {
    keepDomain: true,
  });
}
