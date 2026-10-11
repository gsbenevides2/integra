/**
 * The one route grant that can restore every other grant. Holding it makes a
 * user a "manager". It is the single source of truth for the last-manager
 * lockout check, the permissions UI and the tests; the literal must not be
 * repeated anywhere else in TypeScript.
 */
export const MANAGER_ROUTE_KEY =
  "POST /api/permissions/users/:id/route-grants";
