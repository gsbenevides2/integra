import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "core/db";
import {
    tpLinkCenterInterfaces,
    tpLinkCenterOnlineChecks,
    tpLinkCenterOnlineDeviceChecks,
} from "core/db/schema";

export async function getLatestCheck() {
    const [latestCheck] = await db
        .select()
        .from(tpLinkCenterOnlineChecks)
        .orderBy(desc(tpLinkCenterOnlineChecks.createdAt))
        .limit(1);

    if (!latestCheck) throw new Error("No checks found");

    const devices = await db
        .select()
        .from(tpLinkCenterOnlineDeviceChecks)
        .where(eq(tpLinkCenterOnlineDeviceChecks.checkId, latestCheck.id));

    return {
        id: latestCheck.id,
        createdAt: latestCheck.createdAt.getTime(),
        devices,
    };
}

export async function getDeviceHistory(deviceId: string, params: { from: number; to: number }) {
    const deviceInterfaces = await db
        .select({ mac: tpLinkCenterInterfaces.mac, name: tpLinkCenterInterfaces.name })
        .from(tpLinkCenterInterfaces)
        .where(eq(tpLinkCenterInterfaces.deviceId, deviceId));

    const deviceMacs = deviceInterfaces.map((i) => i.mac);
    const macToName = new Map(deviceInterfaces.map((i) => [i.mac, i.name]));

    const checks = await db
        .select()
        .from(tpLinkCenterOnlineChecks)
        .where(
            and(
                gte(tpLinkCenterOnlineChecks.createdAt, new Date(params.from)),
                lte(tpLinkCenterOnlineChecks.createdAt, new Date(params.to)),
            ),
        )
        .orderBy(desc(tpLinkCenterOnlineChecks.createdAt));

    if (checks.length === 0) return [];

    const checkIds = checks.map((c) => c.id);

    const onlineDeviceChecks =
        deviceMacs.length > 0
            ? await db
                  .select()
                  .from(tpLinkCenterOnlineDeviceChecks)
                  .where(
                      and(
                          inArray(tpLinkCenterOnlineDeviceChecks.checkId, checkIds),
                          inArray(tpLinkCenterOnlineDeviceChecks.mac, deviceMacs),
                      ),
                  )
            : [];

    const onlineByCheck = new Map<string, Set<string>>();
    const routerInterfaceByCheckMac = new Map<string, string>();
    for (const odc of onlineDeviceChecks) {
        if (!onlineByCheck.has(odc.checkId)) onlineByCheck.set(odc.checkId, new Set());
        onlineByCheck.get(odc.checkId)!.add(odc.mac);
        routerInterfaceByCheckMac.set(
            `${odc.checkId}:${odc.mac}`,
            odc.routerInterface ?? "Unknown",
        );
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
