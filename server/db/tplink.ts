import { boolean, index, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const tplink = pgSchema("tp_link_center");

export const tplinkDeviceType = tplink.enum("device_type", ["router", "client"]);

export const tplinkSettings = tplink.table("settings", {
  key: text().primaryKey(),
  value: text().notNull(),
});

export const tplinkDevices = tplink.table("devices", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text().notNull(),
  brand: text().notNull(),
  type: tplinkDeviceType().notNull().default("client"),
  isController: boolean().notNull().default(false),
  routerPassword: text(),
});

export const tplinkInterfaces = tplink.table(
  "interfaces",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    mac: text().notNull(),
    ip: text().notNull(),
    deviceId: text().notNull(),
    reservedIp: boolean().notNull().default(false),
    allowList: boolean().notNull().default(false),
  },
  (table) => [
    index("tplink_interfaces_mac_idx").on(table.mac),
    index("tplink_interfaces_device_idx").on(table.deviceId),
  ],
);

export const tplinkOnlineChecks = tplink.table(
  "online_checks",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tplink_online_checks_created_idx").on(table.createdAt.desc())],
);

export const tplinkRouterStatusHistory = tplink.table(
  "router_status_history",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cpuUsage: integer(),
    memoryUsage: integer(),
    connectionStatus: text().notNull(),
    collectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tplink_router_status_collected_idx").on(table.collectedAt.desc())],
);

export const tplinkOnlineDeviceChecks = tplink.table(
  "online_device_checks",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mac: text().notNull(),
    ip: text().notNull(),
    vendor: text().notNull(),
    name: text().notNull(),
    checkId: text().notNull(),
    routerInterface: text().default("Unknown"),
  },
  (table) => [index("tplink_online_device_checks_check_idx").on(table.checkId)],
);
