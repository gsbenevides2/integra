import { afterAll, beforeAll, beforeEach, expect, mock, spyOn, test } from "bun:test";

import { createFakeDb } from "../../../../helpers/tplink-db";

const fake = createFakeDb();
let R: typeof import("@server/modules/tplink/service/router");
let TpLinkClient: typeof import("@server/modules/tplink/service/client").TpLinkClient;
let Dev: typeof import("@server/modules/tplink/service/devices").TpLinkDeviceService;
let Settings: typeof import("@server/modules/tplink/service/settings").TpLinkSettingsService;
let breaker: typeof import("@server/modules/tplink/service/circuitBreaker");

beforeAll(async () => {
  mock.module("@server/db", () => ({ db: fake.db }));
  R = await import("@server/modules/tplink/service/router");
  TpLinkClient = (await import("@server/modules/tplink/service/client")).TpLinkClient;
  Dev = (await import("@server/modules/tplink/service/devices")).TpLinkDeviceService;
  Settings = (await import("@server/modules/tplink/service/settings")).TpLinkSettingsService;
  breaker = await import("@server/modules/tplink/service/circuitBreaker");
});
afterAll(() => mock.restore());

const MAC = (n: string) => `AA-BB-CC-DD-EE-${n}`;
let handlers: Record<string, (n: number) => any>;
let counts: Record<string, number>;
let addImpl: (oid: string, data: any) => any;
let delImpl: (oid: string, data: any) => any;
let calls: { op: string; oid: string; data?: any }[];
let saved: any[];
let history: any[];
let loginFail: (ip: string) => boolean;
let clientHost = "";

const wanRow = {
  connIPv4Address: "5.5.5.5",
  connStatusV4: "Connected",
  X_TP_Uptime: "90061", // 1d 1h 1m
  X_TP_BytesReceived: String(2 * 1073741824),
  X_TP_BytesSent: String(3 * 1048576),
};

function baseHandlers(): Record<string, (n: number) => any> {
  return {
    DEV2_WIFI_APDEV: () => ({
      data: [
        { X_TP_Active: "1", X_TP_IPAddress: "1.1.1.1", MACAddress: MAC("01"), X_TP_HostName: "mesh", backhaulLinkType: "Ethernet" },
        { X_TP_Active: "1", X_TP_IPAddress: "", MACAddress: MAC("0A"), X_TP_HostName: "", backhaulLinkType: "" },
        { X_TP_Active: "1", X_TP_IPAddress: "1.1.1.3", MACAddress: MAC("0B"), X_TP_HostName: "x", backhaulLinkType: "Wifi" },
        { X_TP_Active: "0", X_TP_IPAddress: "9", MACAddress: MAC("0C"), X_TP_HostName: "off", backhaulLinkType: "" },
      ],
    }),
    DEV2_WIFI_APDEV_ASSOCDEV: () => ({
      data: [
        { active: "1", X_TP_IPAddress: "", MACAddress: MAC("0D"), X_TP_HostName: "iot", X_TP_RadioMac: "R1" },
        { active: "1", X_TP_IPAddress: "1.1.1.9", MACAddress: MAC("0E"), X_TP_HostName: "", X_TP_RadioMac: "RX" },
        { active: "0", X_TP_IPAddress: "", MACAddress: MAC("0F"), X_TP_HostName: "", X_TP_RadioMac: "R1" },
      ],
    }),
    DEV2_WIFI_APDEV_RADIO: () => ({ data: [{ MACAddress: "R1", operatingFrequencyBand: "5", channel: "36" }] }),
    DEV2_WIFI_APDEV_ETHASSOCDEV: () => ({
      data: [
        // same MAC as the mesh agent (different formatting) -> merged
        { active: "1", IPAddress: "1.1.1.1", MACAddress: "aa:bb:cc:dd:ee:01", X_TP_HostName: "wired" },
        { active: "0", IPAddress: "", MACAddress: MAC("10"), X_TP_HostName: "" },
      ],
    }),
    DEV2_HOST_ENTRY: () => ({
      data: [
        { IPAddress: "7.7.7.7", physAddress: MAC("0D"), hostName: "iot-host" },
        { IPAddress: "", physAddress: MAC("0E"), hostName: "skipped" },
      ],
    }),
    DEV2_DHCPV4_POOL_STATICADDR: () => ({
      data: [
        { yiaddr: "1.1.1.1", chaddr: MAC("01"), stack: "1,1,0,0,0,0" },
        { yiaddr: "1.1.1.9", chaddr: MAC("09"), stack: "1,9,0,0,0,0" },
        { yiaddr: "1.1.1.8", chaddr: MAC("08"), stack: "bad" },
      ],
    }),
    DEV2_FW_CHAIN: () => ({
      data: [
        { name: "OTHER", enable: "1", ruleNumberOfEntries: "0", stack: "2,0,0,0,0,0" },
        { name: "ACCESSCTL_WHITE", enable: "1", ruleNumberOfEntries: "2", stack: "1,0,0,0,0,0" },
      ],
    }),
    DEV2_FW_CHAIN_RULE: () => ({
      data: [
        { X_TP_RuleName: "a", X_TP_RuleType: "2", X_TP_SourceType: "2", sourceIP: "", X_TP_SourceMACAddress: MAC("01"), target: "Accept", enable: "1", stack: "1,1,0,0,0,0" },
        { X_TP_RuleName: "b", X_TP_RuleType: "2", X_TP_SourceType: "2", sourceIP: "", X_TP_SourceMACAddress: MAC("99"), target: "Accept", enable: "1", stack: "1,2,0,0,0,0" },
        { X_TP_RuleName: "c", X_TP_RuleType: "2", X_TP_SourceType: "2", sourceIP: "", X_TP_SourceMACAddress: MAC("98"), target: "Accept", enable: "1", stack: "1,3,0,0,0,0" },
        { X_TP_RuleName: "d", X_TP_RuleType: "2", X_TP_SourceType: "2", sourceIP: "", X_TP_SourceMACAddress: MAC("97"), target: "Accept", enable: "1", stack: "2,1,0,0,0,0" },
      ],
    }),
    DEV2_ADT_WAN: () => ({ data: [wanRow] }),
    DEV2_DEV_INFO: () => ({ data: { upTime: "30", softwareVersion: "1.0", hardwareVersion: "" } }),
    DEV2_MEM_STATUS: () => ({ data: { free: "250", total: "1000" } }),
    DEV2_PROC_STATUS: () => ({ data: { CPUUsage: "17" } }),
  };
}

// db.select order inside syncSettings: dhcp interfaces, dhcp devices, fw interfaces, fw devices
function queueDb() {
  fake.queue(
    [
      { mac: MAC("01"), ip: "1.1.1.1", deviceId: "c1", name: "n1" },
      { mac: MAC("02"), ip: "1.1.1.2", deviceId: "r1", name: "n2" },
      { mac: MAC("03"), ip: "1.1.1.3", deviceId: "ctl", name: "n3" },
      { mac: MAC("04"), ip: "1.1.1.4", deviceId: "ghost", name: "n4" },
      { mac: MAC("05"), ip: "1.1.1.5", deviceId: "c1", name: "n5" },
      { mac: MAC("06"), ip: "1.1.1.6", deviceId: "c1", name: "n6" },
    ],
    [
      { id: "c1", type: "client", isController: false },
      { id: "r1", type: "router", isController: false },
      { id: "ctl", type: "router", isController: true },
    ],
    [
      { mac: MAC("01"), ip: "1.1.1.1", deviceId: "c1", name: "f1" },
      { mac: "aa:bb:cc:dd:ee:20", ip: "1.1.1.20", deviceId: "c1", name: "f2" },
      { mac: MAC("21"), ip: "1.1.1.21", deviceId: "c1", name: "f4" },
      { mac: MAC("22"), ip: "1.1.1.22", deviceId: "r1", name: "f3" },
    ],
    [
      { id: "c1", type: "client", isController: false },
      { id: "r1", type: "router", isController: false },
    ],
  );
}

beforeEach(() => {
  mock.restore();
  fake.reset();
  breaker.reset();
  handlers = baseHandlers();
  counts = {};
  calls = [];
  saved = [];
  history = [];
  loginFail = () => false;
  addImpl = (oid, data) => {
    if (oid === "DEV2_DHCPV4_POOL_STATICADDR") {
      if (data.chaddr === MAC("02")) return { data: { stack: "1,22,0,0,0,0" } };
      if (data.chaddr === MAC("05")) return { success: false, errorcode: 5024 };
      return { success: false, errorcode: 1 }; // MAC 06 -> rejected
    }
    if (data.X_TP_SourceMACAddress === "aa:bb:cc:dd:ee:20") return { data: { stack: "1,4,0,0,0,0" } };
    return null; // rejected (null result)
  };
  delImpl = (_oid, data) => {
    if (data.stack === "bad" || data.stack === "1,3,0,0,0,0") throw new Error("del failed");
  };

  spyOn(TpLinkClient.prototype, "login").mockImplementation(async function (this: any) {
    clientHost = this.host;
    if (loginFail(this.host)) throw new Error("login boom");
  });
  const list = async (oid: string, data: any) => {
    counts[oid] = (counts[oid] ?? 0) + 1;
    calls.push({ op: "get", oid, data });
    return handlers[oid]!(counts[oid]!);
  };
  spyOn(TpLinkClient.prototype, "getList").mockImplementation(list as any);
  spyOn(TpLinkClient.prototype, "get").mockImplementation(list as any);
  spyOn(TpLinkClient.prototype, "add").mockImplementation((async (oid: string, data: any) => {
    calls.push({ op: "add", oid, data });
    return addImpl(oid, data);
  }) as any);
  spyOn(TpLinkClient.prototype, "del").mockImplementation((async (oid: string, data: any) => {
    calls.push({ op: "del", oid, data });
    return delImpl(oid, data);
  }) as any);
  spyOn(TpLinkClient.prototype, "op").mockImplementation((async (oid: string) => {
    calls.push({ op: "op", oid });
  }) as any);

  spyOn(Dev, "getControllerRouter").mockResolvedValue({ id: "ctl", name: "C", ip: "10.0.0.1", password: "pw" });
  spyOn(Dev, "getDeviceNameOfMac").mockImplementation(async (mac: string) => (mac === MAC("0E") ? "Known Name" : undefined));
  spyOn(Settings, "saveRouterStatus").mockImplementation(async (s: any) => void saved.push(s));
  spyOn(Settings, "saveRouterStatusHistory").mockImplementation(async (s: any) => void history.push(s));
});

test("syncSettings full run: dhcp, firewall, devices, status", async () => {
  queueDb();
  await R.syncSettings();

  // DHCP: stale entries removed (one failure swallowed), missing ones added
  const dels = calls.filter((c) => c.op === "del");
  expect(dels.filter((c) => c.oid === "DEV2_DHCPV4_POOL_STATICADDR").map((c) => c.data.stack)).toEqual(["1,9,0,0,0,0", "bad"]);
  const dhcpAdds = calls.filter((c) => c.op === "add" && c.oid === "DEV2_DHCPV4_POOL_STATICADDR");
  expect(dhcpAdds.map((c) => c.data.chaddr)).toEqual([MAC("02"), MAC("05"), MAC("06")]);

  // Firewall: stale rules removed, missing allowed
  const fwDels = dels.filter((c) => c.oid === "DEV2_FW_CHAIN_RULE").map((c) => c.data.stack);
  expect(fwDels).toEqual(["1,2,0,0,0,0", "1,3,0,0,0,0"]);
  const fwAdds = calls.filter((c) => c.op === "add" && c.oid === "DEV2_FW_CHAIN_RULE");
  expect(fwAdds).toHaveLength(2);
  expect(fwAdds[0]!.data.stack).toBe("1,4,0,0,0,0");
  expect(fwAdds[0]!.data.target).toBe("Accept");

  // connected devices: merged by MAC and persisted
  const deviceInsert = fake.calls.filter((c) => c.method === "values").at(-1)!.args[0] as any[];
  const byMac = new Map(deviceInsert.map((d) => [d.mac.toLowerCase().replace(/[-:]/g, ""), d]));
  const merged = byMac.get("aabbccddee01");
  expect(merged.name).toBe("mesh");
  expect(merged.routerInterface).toBe("Cabeada");
  expect(byMac.get("aabbccddee0d").ip).toBe("7.7.7.7");
  expect(byMac.get("aabbccddee0d").routerInterface).toBe("Wifi 5 GHz no Canal 36");
  expect(byMac.get("aabbccddee0e").name).toBe("Known Name");
  expect(byMac.get("aabbccddee0e").routerInterface).toBe("Unknown");
  expect(byMac.get("aabbccddee0a").routerInterface).toBe("Roteador");
  expect(byMac.get("aabbccddee0a").name).toBe("Unknown");
  expect(byMac.get("aabbccddee0c")).toBeUndefined();

  // status
  expect(saved[0]).toEqual({
    wanIp: "5.5.5.5",
    connectionStatus: "Connected",
    connectionUptime: "1d 1h 1m",
    routerUptime: "30s",
    firmwareVersion: "1.0",
    hardwareVersion: "N/A",
    cpuUsage: 17,
    memoryUsage: 75,
    totalDownload: "2.0 GB",
    totalUpload: "3.0 MB",
  });
  expect(history[0]).toEqual({ cpuUsage: 17, memoryUsage: 75, connectionStatus: "Connected" });
  expect(breaker.shouldThrottle("sync-tp-link-data")).toBe(false);
});

test("status formatting edge cases", async () => {
  handlers.DEV2_ADT_WAN = () => ({ data: [] });
  handlers.DEV2_DEV_INFO = () => ({ data: { upTime: "0", softwareVersion: "", hardwareVersion: "hw" } });
  handlers.DEV2_FW_CHAIN = () => ({ data: [] }); // no access chain -> firewall skipped
  handlers.DEV2_WIFI_APDEV = () => ({ data: [] });
  handlers.DEV2_WIFI_APDEV_ASSOCDEV = () => ({ data: [] });
  handlers.DEV2_WIFI_APDEV_ETHASSOCDEV = () => ({ data: [] });
  await R.syncSettings();
  expect(saved[0].connectionStatus).toBe("Unknown");
  expect(saved[0].connectionUptime).toBe("N/A");
  expect(saved[0].totalDownload).toBe("N/A");
  expect(saved[0].wanIp).toBe("");
  expect(saved[0].firmwareVersion).toBe("N/A");
  expect(fake.calls.filter((c) => c.method === "values")).toHaveLength(1); // only the check row, no devices

  for (const [bytes, expected] of [[512, "512 B"], [2048, "2.0 KB"], [5 * 1048576, "5.0 MB"]] as const) {
    handlers.DEV2_ADT_WAN = () => ({ data: [{ ...wanRow, X_TP_BytesReceived: String(bytes), X_TP_Uptime: "7200" }] });
    await R.syncSettings();
    expect(saved.at(-1).totalDownload).toBe(expected);
    expect(saved.at(-1).connectionUptime).toBe("2h");
  }
});

test("host table failures are tolerated", async () => {
  handlers.DEV2_HOST_ENTRY = () => {
    throw new Error("no table");
  };
  handlers.DEV2_FW_CHAIN = () => ({ data: [] });
  await R.syncSettings();
  expect(saved).toHaveLength(1);

  handlers.DEV2_HOST_ENTRY = () => ({}); // data undefined
  await R.syncSettings();
  expect(saved).toHaveLength(2);
});

test("firewall: access chain vanishing and empty chain rules", async () => {
  handlers.DEV2_FW_CHAIN = (n) =>
    n === 1 ? { data: [{ name: "ACCESSCTL_WHITE", enable: "1", ruleNumberOfEntries: "0", stack: "1,0,0,0,0,0" }] } : { data: [] };
  handlers.DEV2_FW_CHAIN_RULE = () => ({ data: [] });
  fake.queue([], [], [{ mac: MAC("30"), ip: "i", deviceId: "c1", name: "x" }], [{ id: "c1", type: "client" }]);
  await expect(R.syncSettings()).rejects.toThrow("Missing access chain");

  breaker.reset();
  handlers.DEV2_FW_CHAIN = () => ({ data: [{ name: "ACCESSCTL_WHITE", enable: "1", ruleNumberOfEntries: "0", stack: "1,0,0,0,0,0" }] });
  fake.queue([], [], [{ mac: MAC("30"), ip: "i", deviceId: "c1", name: "x" }], [{ id: "c1", type: "client" }]);
  addImpl = () => ({ data: { stack: "ok" } });
  await R.syncSettings();
  const add = calls.find((c) => c.op === "add" && c.oid === "DEV2_FW_CHAIN_RULE")!;
  expect(add.data.stack).toBe("1,1,0,0,0,0");
  expect(add.data.sourceIP).toBeUndefined();
});

test("syncSettings errors and circuit breaker", async () => {
  (Dev.getControllerRouter as any).mockResolvedValue(null);
  for (let i = 0; i < 3; i++) {
    await expect(R.syncSettings()).rejects.toThrow("No controller router registered");
  }
  await expect(R.syncSettings()).rejects.toThrow("Circuit breaker open");

  breaker.reset();
  (Dev.getControllerRouter as any).mockRejectedValue("plain string");
  await expect(R.syncSettings()).rejects.toThrow("plain string");
});

test("restartNetwork reboots agents then controller, tolerating failures", async () => {
  spyOn(Dev, "getAllRouters").mockResolvedValue([
    { ip: "10.0.0.1", password: "p", isController: true },
    { ip: "10.0.0.2", password: "p", isController: false },
    { ip: "10.0.0.3", password: "p", isController: false },
  ]);
  loginFail = (h) => h === "10.0.0.3";
  await R.restartNetwork();
  expect(calls.filter((c) => c.op === "op")).toHaveLength(2);

  calls.length = 0;
  loginFail = (h) => h === "10.0.0.1";
  await R.restartNetwork();
  expect(calls.filter((c) => c.op === "op")).toHaveLength(2);

  (Dev.getAllRouters as any).mockResolvedValue([{ ip: "10.0.0.2", password: "p", isController: false }]);
  calls.length = 0;
  await R.restartNetwork();
  expect(calls.filter((c) => c.op === "op")).toHaveLength(1);
  expect(clientHost).toBe("10.0.0.2");
});
