import { db } from "@server/db";
import { tplinkInterfaces, tplinkOnlineChecks, tplinkOnlineDeviceChecks } from "@server/db/schema";

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

export abstract class TpLinkChecksService {
  static async getLatestCheck() {
    const [latestCheck] = await db
      .select()
      .from(tplinkOnlineChecks)
      .orderBy(desc(tplinkOnlineChecks.createdAt))
      .limit(1);

    if (!latestCheck) throw new Error("No checks found");

    const devices = await db
      .select()
      .from(tplinkOnlineDeviceChecks)
      .where(eq(tplinkOnlineDeviceChecks.checkId, latestCheck.id));

    return {
      id: latestCheck.id,
      createdAt: latestCheck.createdAt.getTime(),
      devices,
    };
  }

  static async getDeviceHistory(deviceId: string, params: { from: number; to: number }) {
    const deviceInterfaces = await db
      .select({ mac: tplinkInterfaces.mac, name: tplinkInterfaces.name })
      .from(tplinkInterfaces)
      .where(eq(tplinkInterfaces.deviceId, deviceId));

    const deviceMacs = deviceInterfaces.map((i) => i.mac);
    const macToName = new Map(deviceInterfaces.map((i) => [i.mac, i.name]));

    const checks = await db
      .select()
      .from(tplinkOnlineChecks)
      .where(
        and(
          gte(tplinkOnlineChecks.createdAt, new Date(params.from)),
          lte(tplinkOnlineChecks.createdAt, new Date(params.to)),
        ),
      )
      .orderBy(desc(tplinkOnlineChecks.createdAt));

    if (checks.length === 0) return [];

    const checkIds = checks.map((c) => c.id);

    const onlineDeviceChecks =
      deviceMacs.length > 0
        ? await db
            .select()
            .from(tplinkOnlineDeviceChecks)
            .where(
              and(
                inArray(tplinkOnlineDeviceChecks.checkId, checkIds),
                inArray(tplinkOnlineDeviceChecks.mac, deviceMacs),
              ),
            )
        : [];

    const onlineByCheck = new Map<string, Set<string>>();
    const routerInterfaceByCheckMac = new Map<string, string>();
    for (const odc of onlineDeviceChecks) {
      if (!onlineByCheck.has(odc.checkId)) onlineByCheck.set(odc.checkId, new Set());
      onlineByCheck.get(odc.checkId)!.add(odc.mac);
      routerInterfaceByCheckMac.set(`${odc.checkId}:${odc.mac}`, odc.routerInterface ?? "Unknown");
    }

    return checks.map((check) => {
      const onlineMacs = onlineByCheck.get(check.id) ?? new Set<string>();
      return {
        checkId: check.id,
        createdAt: check.createdAt.getTime(),
        online: onlineMacs.size > 0,
        interfaces: Array.from(onlineMacs).map((mac) => ({
          mac,
          name: macToName.get(mac) ?? mac,
          routerInterface: routerInterfaceByCheckMac.get(`${check.id}:${mac}`) ?? "",
        })),
      };
    });
  }
}
