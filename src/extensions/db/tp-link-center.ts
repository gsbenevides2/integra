import { boolean, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const tpLinkCenter = pgSchema("tp_link_center");

export const tpLinkCenterDeviceType = tpLinkCenter.enum("device_type", ["router", "client"]);

export const tpLinkCenterSettings = tpLinkCenter.table("settings", {
    key: text().primaryKey(),
    value: text().notNull(),
});

export const tpLinkCenterDevices = tpLinkCenter.table("devices", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    brand: text().notNull(),
    type: tpLinkCenterDeviceType().notNull().default("client"),
    isController: boolean().notNull().default(false),
    routerPassword: text(),
});

export const tpLinkCenterInterfaces = tpLinkCenter.table("interfaces", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    mac: text().notNull(),
    ip: text().notNull(),
    deviceId: text().notNull(),
    reservedIp: boolean().notNull().default(false),
    allowList: boolean().notNull().default(false),
});

export const tpLinkCenterOnlineChecks = tpLinkCenter.table("online_checks", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const tpLinkCenterOnlineDeviceChecks = tpLinkCenter.table("online_device_checks", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    mac: text().notNull(),
    ip: text().notNull(),
    vendor: text().notNull(),
    name: text().notNull(),
    checkId: text().notNull(),
    routerInterface: text().default("Unknown"),
});
