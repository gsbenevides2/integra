import {
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const auth = pgSchema("auth");

/** The kinds of resource a grant can point at. */
export const authResourceType = auth.enum("resource_type", [
  "tuya_device",
  "tuya_sensor",
  "tuya_preset",
  "frigate_camera",
  "cron_job",
]);

/** The actions a grant can carry. Not every action is valid for every resource type. */
export const authResourceAction = auth.enum("resource_action", [
  "read",
  "write",
  "apply",
  "execute",
]);

/**
 * One row per Authentik user ever seen. Rows are auto-created on the first
 * authenticated request with zero grants, so a user shows up in the permissions
 * dashboard before anyone grants them anything.
 */
export const authUsers = auth.table("users", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  uid: text().notNull().unique(),
  username: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Route-level grants keyed by HTTP method plus Elysia route template. */
export const authRouteGrants = auth.table(
  "route_grants",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    routeKey: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_route_grants_user_route_idx").on(
      table.userId,
      table.routeKey,
    ),
  ],
);

/** Per-resource grants (device, sensor, preset, camera, cron). */
export const authResourceGrants = auth.table(
  "resource_grants",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    resourceType: authResourceType().notNull(),
    resourceId: text().notNull(),
    action: authResourceAction().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_resource_grants_unique_idx").on(
      table.userId,
      table.resourceType,
      table.resourceId,
      table.action,
    ),
    index("auth_resource_grants_resource_idx").on(
      table.resourceType,
      table.resourceId,
    ),
  ],
);
