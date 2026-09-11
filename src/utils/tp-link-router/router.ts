import * as macOuiLookup from "mac-oui-lookup";

function resolveGetVendor(mod: unknown): (mac: string, unknown?: string | null) => string | null {
    for (const candidate of [
        (mod as any)?.default,
        (mod as any)?.getVendor,
        (mod as any)?.default?.default,
        mod,
    ]) {
        if (typeof candidate === "function") return candidate;
    }
    throw new Error("mac-oui-lookup: could not resolve getVendor function from module exports");
}

const getVendor = resolveGetVendor(macOuiLookup);
import { eq } from "drizzle-orm";
import { db } from "core/db";
import {
    tpLinkCenterDevices,
    tpLinkCenterInterfaces,
    tpLinkCenterOnlineChecks,
    tpLinkCenterOnlineDeviceChecks,
} from "core/db/schema";
import { TpLinkClient } from "./client";
import { getAllRouters, getControllerRouter, getDeviceNameOfMac } from "./devices";
import { normalizeMac } from "./normalizeMac";
import { saveRouterStatus, saveRouterStatusHistory } from "./settings";
import type {
    ConnectedDevices,
    DEV2_ADT_WAN,
    DEV2_DEV_INFO,
    DEV2_DHCPV4_POOL_STATICADDR,
    DEV2_FW_CHAIN,
    DEV2_FW_CHAIN_RULE,
    DEV2_MEM_STATUS,
    DEV2_PROC_STATUS,
    DEV2_WIFI_APDEV,
    DEV2_WIFI_APDEV_ASSOCDEV,
    DEV2_WIFI_APDEV_ETHASSOCDEV,
    DEV2_WIFI_APDEV_RADIO,
    DhcpEntries,
} from "./types";
import type { RouterStatus } from "./settings";

const vendorCache = new Map<string, string>();

async function getRouterClient(ip: string, password: string): Promise<TpLinkClient> {
    const client = new TpLinkClient({ host: ip, username: "user", password });
    await client.login();
    return client;
}

function getVendorCached(mac: string): string {
    const oui = mac.slice(0, 8);
    if (!vendorCache.has(oui)) {
        vendorCache.set(oui, getVendor(mac) ?? "Unknown");
    }
    return vendorCache.get(oui)!;
}

async function getConnectedEasyMeshDevices(client: TpLinkClient): Promise<ConnectedDevices> {
    const result = await client.getList<{ data: DEV2_WIFI_APDEV[] }>("DEV2_WIFI_APDEV", {
        stack: "0,0,0,0,0,0",
        pstack: "0,0,0,0,0,0",
    });

    function processBackLinkType(type: string) {
        if (type === "Ethernet") return "Cabeada";
        if (type === "") return "Roteador";
        return "Unknown";
    }

    return Promise.all(
        result.data
            .filter((item) => item.X_TP_Active === "1")
            .map(async (item) => ({
                ip: item.X_TP_IPAddress,
                mac: item.MACAddress,
                name:
                    (await getDeviceNameOfMac(item.MACAddress)) || item.X_TP_HostName || "Unknown",
                routerInterface: processBackLinkType(item.backhaulLinkType),
                vendor: getVendorCached(item.MACAddress),
            })),
    );
}

async function getConnectedWifiDevices(client: TpLinkClient): Promise<ConnectedDevices> {
    const assocDev = await client.getList<{ data: DEV2_WIFI_APDEV_ASSOCDEV[] }>(
        "DEV2_WIFI_APDEV_ASSOCDEV",
        {
            stack: "0,0,0,0,0,0",
            pstack: "0,0,0,0,0,0",
        },
    );
    const radios = await client.getList<{ data: DEV2_WIFI_APDEV_RADIO[] }>(
        "DEV2_WIFI_APDEV_RADIO",
        {
            stack: "0,0,0,0,0,0",
            pstack: "0,0,0,0,0,0",
        },
    );

    function getRouterInterface(radioMac: string) {
        const data = radios.data.find((item) => item.MACAddress === radioMac);
        if (!data) return "Unknown";
        return `Wifi ${data.operatingFrequencyBand} GHz no Canal ${data.channel}`;
    }

    return Promise.all(
        assocDev.data
            .filter((item) => item.active === "1")
            .map(async (item) => ({
                ip: item.X_TP_IPAddress,
                mac: item.MACAddress,
                name:
                    (await getDeviceNameOfMac(item.MACAddress)) || item.X_TP_HostName || "Unknown",
                vendor: getVendorCached(item.MACAddress),
                routerInterface: getRouterInterface(item.X_TP_RadioMac),
            })),
    );
}

async function getConnectedWiredDevices(client: TpLinkClient): Promise<ConnectedDevices> {
    const result = await client.getList<{ data: DEV2_WIFI_APDEV_ETHASSOCDEV[] }>(
        "DEV2_WIFI_APDEV_ETHASSOCDEV",
        {
            stack: "0,0,0,0,0,0",
            pstack: "0,0,0,0,0,0",
        },
    );

    return Promise.all(
        result.data
            .filter((i) => i.active === "1")
            .map(async (i) => ({
                ip: i.IPAddress,
                mac: i.MACAddress,
                name: (await getDeviceNameOfMac(i.MACAddress)) || i.X_TP_HostName || "Unknown",
                routerInterface: "Cabeada",
                vendor: getVendorCached(i.MACAddress),
            })),
    );
}

async function getConnectedDevices(client: TpLinkClient): Promise<ConnectedDevices> {
    const result = await Promise.all([
        getConnectedEasyMeshDevices(client),
        getConnectedWifiDevices(client),
        getConnectedWiredDevices(client),
    ]);
    return result.flat().filter((r) => r.ip !== "");
}

async function listDHCPEntry(client: TpLinkClient): Promise<DhcpEntries> {
    const result = await client.getList<{ data: DEV2_DHCPV4_POOL_STATICADDR[] }>(
        "DEV2_DHCPV4_POOL_STATICADDR",
        {
            stack: "0,0,0,0,0,0",
            pstack: "0,0,0,0,0,0",
        },
    );
    return result.data.map((e) => ({ ip: e.yiaddr, mac: e.chaddr, entryId: e.stack }));
}

// TP-Link's gdpr API returns this errorcode when the entry being added already exists
// on the router (e.g. it was added by a previous sync run under a MAC/IP formatting the
// router considers a match, even if our own list call didn't surface it). Treat it as a
// no-op rather than a failure.
const ALREADY_EXISTS_ERRORCODE = 5024;

function isAlreadyExistsResponse(result: unknown): boolean {
    return (
        typeof result === "object" &&
        result !== null &&
        (result as { success?: boolean }).success === false &&
        (result as { errorcode?: number }).errorcode === ALREADY_EXISTS_ERRORCODE
    );
}

async function addDHCPEntry(mac: string, ip: string, client: TpLinkClient): Promise<string | null> {
    const result = await client.add<{ data?: { stack: string } }>("DEV2_DHCPV4_POOL_STATICADDR", {
        chaddr: mac,
        yiaddr: ip,
        enable: "1",
        pstack: "1,0,0,0,0,0",
        stack: "0,0,0,0,0,0",
    });
    if (!result?.data?.stack) {
        if (isAlreadyExistsResponse(result)) return null;
        throw new Error(`Router rejected DHCP entry for ${mac}/${ip}: ${JSON.stringify(result)}`);
    }
    return result.data.stack;
}

async function removeDHCPEntry(id: string, client: TpLinkClient): Promise<void> {
    await client.del<void>("DEV2_DHCPV4_POOL_STATICADDR", { stack: id, pstack: "1,0,0,0,0,0" });
}

async function listFirewallChains(client: TpLinkClient) {
    const chains = await client.getList<{ data: DEV2_FW_CHAIN[] }>("DEV2_FW_CHAIN", {
        pstack: "0,0,0,0,0,0",
        stack: "0,0,0,0,0,0",
    });
    return chains.data.map((c) => ({
        name: c.name,
        enable: c.enable,
        ruleNumberOfEntries: c.ruleNumberOfEntries,
        stack: c.stack,
    }));
}

async function listFirewallRules(client: TpLinkClient) {
    const rawRules = await client.getList<{ data: DEV2_FW_CHAIN_RULE[] }>("DEV2_FW_CHAIN_RULE", {
        pstack: "0,0,0,0,0,0",
        stack: "0,0,0,0,0,0",
    });
    return rawRules.data.map((r) => ({
        ruleName: r.X_TP_RuleName,
        ruleType: r.X_TP_RuleType,
        sourceType: r.X_TP_SourceType,
        sourceIP: r.sourceIP,
        sourceMAC: r.X_TP_SourceMACAddress,
        target: r.target,
        enable: r.enable,
        stack: r.stack,
    }));
}

async function addFirewallRule(
    params: {
        chainStack: string;
        name: string;
        sourceMAC: string;
        sourceIP?: string;
        target?: string;
        stack: string;
    },
    client: TpLinkClient,
): Promise<string | null> {
    const data: Record<string, unknown> = {
        enable: "1",
        X_TP_RuleType: "2",
        X_TP_RuleName: params.name,
        X_TP_SourceType: "2",
        X_TP_SourceMACAddress: params.sourceMAC,
        pstack: params.chainStack,
        target: params.target || "Drop",
        stack: params.stack,
    };
    if (params.sourceIP) data.sourceIP = params.sourceIP;
    const result = await client.add<{ data?: { stack: string } }>("DEV2_FW_CHAIN_RULE", data);
    if (!result?.data?.stack) {
        if (isAlreadyExistsResponse(result)) return null;
        throw new Error(
            `Router rejected firewall rule for ${params.sourceMAC}: ${JSON.stringify(result)}`,
        );
    }
    return result.data.stack;
}

async function removeFirewallRule(ruleStack: string, client: TpLinkClient): Promise<void> {
    await client.del<void>("DEV2_FW_CHAIN_RULE", { stack: ruleStack, pstack: "0,0,0,0,0,0" });
}

async function rebootRouter(client: TpLinkClient): Promise<void> {
    await client.op<void>("ACT_REBOOT");
}

export async function restartNetwork(): Promise<void> {
    const allRouters = await getAllRouters();
    const controller = allRouters.find((r) => r.isController);
    const agents = allRouters.filter((r) => !r.isController);

    for (const agent of agents) {
        try {
            const client = await getRouterClient(agent.ip, agent.password);
            await rebootRouter(client);
        } catch (error) {
            console.error(`Error rebooting agent ${agent.ip}:`, error);
        }
    }
    if (controller) {
        try {
            const client = await getRouterClient(controller.ip, controller.password);
            await rebootRouter(client);
        } catch (error) {
            console.error(`Error rebooting controller ${controller.ip}:`, error);
        }
    }
}

async function getStatus(client: TpLinkClient): Promise<RouterStatus> {
    const [wanInfo, devInfo, memoryStatus, procStatus] = await Promise.all([
        client.getList<{ data: DEV2_ADT_WAN[] }>("DEV2_ADT_WAN", {
            pstack: "0,0,0,0,0,0",
            stack: "0,0,0,0,0,0",
        }),
        client.get<{ data: DEV2_DEV_INFO }>("DEV2_DEV_INFO", {
            pstack: "0,0,0,0,0,0",
            stack: "0,0,0,0,0,0",
        }),
        client.get<{ data: DEV2_MEM_STATUS }>("DEV2_MEM_STATUS", {
            pstack: "0,0,0,0,0,0",
            stack: "0,0,0,0,0,0",
        }),
        client.get<{ data: DEV2_PROC_STATUS }>("DEV2_PROC_STATUS", {
            pstack: "0,0,0,0,0,0",
            stack: "0,0,0,0,0,0",
        }),
    ]);

    const wanIp = wanInfo.data.at(0)?.connIPv4Address ?? "";
    const connectionStatus = wanInfo.data.at(0)?.connStatusV4;
    const connectionUptime = Number(wanInfo.data.at(0)?.X_TP_Uptime);
    const totalDownload = Number(wanInfo.data.at(0)?.X_TP_BytesReceived);
    const totalUpload = Number(wanInfo.data.at(0)?.X_TP_BytesSent);

    const routerUptime = Number(devInfo.data.upTime);

    const freeMemory = Number(memoryStatus.data.free);
    const totalMemory = Number(memoryStatus.data.total);
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = parseInt(((usedMemory / totalMemory) * 100).toString());

    const cpuUsage = Number(procStatus.data.CPUUsage);

    const formatUptime = (totalSeconds: number): string => {
        if (!totalSeconds) return "N/A";
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const parts: string[] = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (parts.length === 0) parts.push(`${totalSeconds}s`);
        return parts.join(" ");
    };

    const formatBytes = (b: number): string => {
        if (isNaN(b)) return "N/A";
        if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
        if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
        if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${b} B`;
    };

    return {
        wanIp,
        connectionStatus: connectionStatus || "Unknown",
        connectionUptime: formatUptime(connectionUptime),
        routerUptime: formatUptime(routerUptime),
        firmwareVersion: devInfo?.data.softwareVersion || "N/A",
        hardwareVersion: devInfo?.data.hardwareVersion || "N/A",
        cpuUsage,
        memoryUsage,
        totalDownload: formatBytes(totalDownload),
        totalUpload: formatBytes(totalUpload),
    };
}

async function syncDhcp(client: TpLinkClient): Promise<void> {
    const interfaces = await db
        .select()
        .from(tpLinkCenterInterfaces)
        .where(eq(tpLinkCenterInterfaces.reservedIp, true));
    const devices = await db.select().from(tpLinkCenterDevices);
    const deviceById = new Map(devices.map((d) => [d.id, d]));

    const interfacesToSync = interfaces.filter((i) => {
        const device = deviceById.get(i.deviceId);
        return device?.type === "client" || (device?.type === "router" && !device.isController);
    });

    const routerEntries = await listDHCPEntry(client);

    const dbMacs = new Set(interfacesToSync.map((i) => normalizeMac(i.mac)));
    const routerMacToEntry = new Map(routerEntries.map((e) => [normalizeMac(e.mac), e]));

    for (const entry of routerEntries) {
        const normalizedMac = normalizeMac(entry.mac);
        if (!dbMacs.has(normalizedMac)) {
            await removeDHCPEntry(entry.entryId, client).catch((e) => {
                console.error(
                    `Failed to remove DHCP entry for ${entry.mac}: ${e instanceof Error ? e.message : String(e)}`,
                );
            });
        }
    }

    for (const iface of interfacesToSync) {
        const normalizedMac = normalizeMac(iface.mac);
        if (!routerMacToEntry.has(normalizedMac)) {
            await addDHCPEntry(iface.mac, iface.ip, client).catch((e) => {
                console.error(
                    `Failed to add DHCP entry for ${iface.mac}: ${e instanceof Error ? e.message : String(e)}`,
                );
            });
        }
    }
}

async function getAvailableFirewallRuleStackId(client: TpLinkClient): Promise<number> {
    const chains = await listFirewallChains(client);
    const accessChain = chains.find((c) => c.name === "ACCESSCTL_WHITE");
    const allRouterRules = await listFirewallRules(client);
    if (!accessChain) throw new Error("Missing access chain");

    const chainId = accessChain.stack.split(",")[0];
    const routerRules = allRouterRules.filter((r) => r.stack.split(",")[0] === chainId);
    const ids = routerRules.map((r) => Number(r.stack.split(",").at(1))).sort((a, b) => a - b);
    const lastId = ids.length > 0 ? ids.at(-1)! : 0;
    return lastId + 1;
}

async function syncFirewall(client: TpLinkClient): Promise<void> {
    const interfaces = await db
        .select()
        .from(tpLinkCenterInterfaces)
        .where(eq(tpLinkCenterInterfaces.allowList, true));
    const devices = await db.select().from(tpLinkCenterDevices);
    const deviceById = new Map(devices.map((d) => [d.id, d]));

    const clientInterfaces = interfaces.filter(
        (i) => deviceById.get(i.deviceId)?.type === "client",
    );

    const chains = await listFirewallChains(client);
    const accessChain = chains.find((c) => c.name === "ACCESSCTL_WHITE");
    if (!accessChain) return;

    const allRouterRules = await listFirewallRules(client);
    const accessChainId = accessChain.stack.split(",")[0];
    const routerRules = allRouterRules.filter((r) => r.stack.split(",")[0] === accessChainId);

    const dbMacs = new Set(clientInterfaces.map((i) => normalizeMac(i.mac)));
    const routerMacToRule = new Map(routerRules.map((r) => [normalizeMac(r.sourceMAC), r]));

    for (const rule of routerRules) {
        const normalizedMac = normalizeMac(rule.sourceMAC);
        if (!dbMacs.has(normalizedMac)) {
            await removeFirewallRule(rule.stack, client).catch((e) => {
                console.error(
                    `Failed to remove firewall rule for ${rule.sourceMAC}: ${e instanceof Error ? e.message : String(e)}`,
                );
            });
        }
    }

    for (const iface of clientInterfaces) {
        const normalizedMac = normalizeMac(iface.mac);
        if (!routerMacToRule.has(normalizedMac)) {
            const currentRuleChain = await getAvailableFirewallRuleStackId(client);
            const chainId = accessChain.stack.split(",")[0];
            await addFirewallRule(
                {
                    chainStack: accessChain.stack,
                    name: iface.name,
                    sourceMAC: iface.mac,
                    target: "Accept",
                    stack: `${chainId},${currentRuleChain},0,0,0,0`,
                },
                client,
            ).catch((e) => {
                console.error(
                    `Failed to add firewall rule for ${iface.mac}: ${e instanceof Error ? e.message : String(e)}`,
                );
            });
        }
    }
}

async function syncConnectedDevices(client: TpLinkClient): Promise<void> {
    const devices = await getConnectedDevices(client);
    const checkId = crypto.randomUUID();

    await db.insert(tpLinkCenterOnlineChecks).values({ id: checkId, createdAt: new Date() });

    if (devices.length > 0) {
        await db.insert(tpLinkCenterOnlineDeviceChecks).values(
            devices.map((d) => ({
                mac: d.mac,
                ip: d.ip,
                checkId,
                name: d.name,
                vendor: d.vendor,
                routerInterface: d.routerInterface,
            })),
        );
    }
}

async function syncRouterStatus(client: TpLinkClient): Promise<void> {
    const status = await getStatus(client);
    await saveRouterStatus(status);
    await saveRouterStatusHistory({
        cpuUsage: status.cpuUsage,
        memoryUsage: status.memoryUsage,
        connectionStatus: status.connectionStatus,
    });
}

export async function syncSettings(): Promise<void> {
    try {
        const controller = await getControllerRouter();
        if (!controller) {
            throw new Error(
                "No controller router registered. Please register a router controller first.",
            );
        }

        const client = await getRouterClient(controller.ip, controller.password);
        await syncDhcp(client);
        await syncFirewall(client);
        await syncConnectedDevices(client);
        await syncRouterStatus(client);
    } catch (error) {
        console.error("Error syncing router settings:", error);
        throw new Error(
            "Error syncing router settings: " +
                (error instanceof Error ? error.message : String(error)),
        );
    }
}
