import type { permissionsRoutes } from "@server/modules/permissions";

import { treaty } from "@elysia/eden";

export function getPermissionsEdenClient() {
  return treaty<typeof permissionsRoutes>("", {
    keepDomain: true,
  });
}
