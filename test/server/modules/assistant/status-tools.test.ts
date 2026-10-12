import * as authz from "@server/shared/authz";

import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { makeContext, provideEnv, runTool, TUYA_ENV } from "./helpers";

afterAll(provideEnv(TUYA_ENV));

const { statusTools } = await import("@server/modules/assistant/tools/status");
const { calendarTools, resolveDay, saoPauloDate } = await import("@server/modules/assistant/tools/calendar");
const { cronTools } = await import("@server/modules/assistant/tools/crons");
const { jobRegistry } = await import("@server/cron");
const { ServerMetricsService } = await import("@server/modules/server-metrics/service/collect");
const { StatusPlatformService } = await import("@server/modules/status-platform/service/platforms");
const { TpLinkChecksService } = await import("@server/modules/tplink/service/checks");
const { TpLinkDeviceService } = await import("@server/modules/tplink/service/devices");
const { TpLinkSettingsService } = await import("@server/modules/tplink/service/settings");
const { TrainStatusService } = await import("@server/modules/train-status/service/checks");
const { CalendarService } = await import("@server/modules/google/service/calendar");

const spies: { mockRestore: () => void }[] = [];
 
const spy = (obj: object, key: string): any => {
  const s = spyOn(obj as never, key as never);
  spies.push(s);
  return s;
};
const at = new Date("2026-10-11T12:00:00Z");

beforeEach(() => spy(authz, "hasRouteGrant").mockResolvedValue(true));
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe("status tools", () => {
  test("status_servidor summarises memory, disks and the latest speedtest", async () => {
    spy(ServerMetricsService, "latest").mockResolvedValue({
      id: "1", memoryTotalMb: 2048, memoryUsedMb: 512, memoryFreeMb: 1536, networkRxKbs: 10, networkTxKbs: 5,
      disks: [{ filesystem: "/dev/sda", totalMb: 10240, usedMb: 5120, freeMb: 5120, usagePercent: 50, mountedAt: "/" }],
      collectedAt: at,
    });
    spy(ServerMetricsService, "speedtestLatest").mockResolvedValue({
      id: "1", downloadMbps: 312.345, uploadMbps: 101.01, latencyMs: 12.34, collectedAt: at,
    });
    const ctx = makeContext();
    expect(await runTool(statusTools(ctx), "status_servidor")).toEqual({
      servidor: {
        memoriaUsadaPercent: 25, memoriaTotalGb: 2, redeRecebendoKbs: 10, redeEnviandoKbs: 5,
        discos: [{ montadoEm: "/", usoPercent: 50, livreGb: 5 }], coletadoEm: at.toISOString(),
      },
      internet: { downloadMbps: 312.3, uploadMbps: 101, latenciaMs: 12.3, medidoEm: at.toISOString() },
    });
    expect(ctx.actions[0]?.summary).toBe("Consultou o status do servidor");
  });

  test("status_servidor tolerates missing data", async () => {
    spy(ServerMetricsService, "latest").mockResolvedValue(null);
    spy(ServerMetricsService, "speedtestLatest").mockResolvedValue(null);
    expect(await runTool(statusTools(makeContext()), "status_servidor")).toEqual({ servidor: null, internet: null });
  });

  test("status_plataformas lists all, or one by name", async () => {
    const platforms = [
      { id: "1", name: "GitHub", url: "", type: "atlassian", status: "OK", problemDescription: null, lastCheckedAt: at },
      { id: "2", name: "Cloudflare", url: "", type: "cloudflare", status: "DOWN", problemDescription: "DNS", lastCheckedAt: at },
    ];
    spy(StatusPlatformService, "list").mockResolvedValue(platforms);
    const ctx = makeContext();
    const tools = statusTools(ctx);
    expect((await runTool(tools, "status_plataformas", {})).plataformas).toHaveLength(2);
    expect(await runTool(tools, "status_plataformas", { plataforma: "cloudflare" })).toEqual({
      plataformas: [{ nome: "Cloudflare", status: "DOWN", problema: "DNS", verificadoEm: at }],
    });
    expect(await runTool(tools, "status_plataformas", { plataforma: "aws" })).toHaveProperty("error");
    expect(ctx.actions[0]?.summary).toBe("Consultou 2 plataformas");
  });

  test("status_linhas_trem maps the latest line checks", async () => {
    spy(TrainStatusService, "listLatest").mockResolvedValue([
      { lineCode: 9, lineColor: "Esmeralda", situation: "Normal", status: "normal", description: null, checkedAt: at },
    ]);
    const ctx = makeContext();
    expect(await runTool(statusTools(ctx), "status_linhas_trem")).toEqual({
      linhas: [{ linha: 9, cor: "Esmeralda", situacao: "Normal", status: "normal", descricao: null }],
    });
    expect(ctx.actions[0]?.summary).toBe("Consultou as linhas de trem");
  });

  test("status_roteador and dispositivos_conectados", async () => {
    spy(TpLinkSettingsService, "getLatestRouterStatus").mockResolvedValue({
      wanIp: "1.2.3.4", connectionStatus: "connected", connectionUptime: "1d", routerUptime: "2d",
      firmwareVersion: "", hardwareVersion: "", cpuUsage: 10, memoryUsage: 40, totalDownload: null, totalUpload: null,
    });
    spy(TpLinkChecksService, "getLatestCheck").mockResolvedValue({
      id: "c", createdAt: at.getTime(),
      devices: [
        { id: "1", mac: "AA", ip: "", vendor: "Apple", name: "", checkId: "c", routerInterface: null },
        { id: "2", mac: "BB", ip: "", vendor: "", name: "tv", checkId: "c", routerInterface: null },
        { id: "3", mac: "CC", ip: "", vendor: "Xiaomi", name: "", checkId: "c", routerInterface: null },
        { id: "4", mac: "DD", ip: "", vendor: "", name: "", checkId: "c", routerInterface: null },
      ],
    });
    spy(TpLinkDeviceService, "getDeviceNamesByMacs").mockResolvedValue(new Map([["AA", "iPhone"]]));
    const ctx = makeContext();
    const tools = statusTools(ctx);
    expect(await runTool(tools, "status_roteador")).toEqual({
      conexao: "connected", ipExterno: "1.2.3.4", conexaoAtivaHa: "1d", roteadorLigadoHa: "2d", cpuPercent: 10, memoriaPercent: 40,
    });
    expect(await runTool(tools, "dispositivos_conectados")).toEqual({
      verificadoEm: at.toISOString(), total: 4, dispositivos: ["iPhone", "tv", "Xiaomi", "DD"],
    });
    expect(ctx.actions.map((a) => a.summary)).toEqual(["Consultou o roteador", "4 aparelhos conectados"]);
  });
});

describe("calendar tool", () => {
  test("resolveDay understands hoje, amanha and explicit dates in São Paulo time", () => {
    const lateNight = new Date("2026-10-12T02:00:00Z"); // still the 11th in São Paulo
    expect(saoPauloDate(lateNight)).toBe("2026-10-11");
    expect(resolveDay("hoje", lateNight)).toBe("2026-10-11");
    expect(resolveDay("amanha", lateNight)).toBe("2026-10-12");
    expect(resolveDay("2026-12-25")).toBe("2026-12-25");
    expect(resolveDay("hoje")).toBe(saoPauloDate(new Date()));
  });

  test("agenda merges calendars and events, sorted by start", async () => {
    const cal = { email: "a@x", primary: true, summary: "A", calendarId: "a" };
    spy(CalendarService, "listCalendars").mockResolvedValue([cal, { ...cal, email: "b@x" }]);
    const event = (id: string, startDate: string, location = "") => ({
      id, summary: id, description: "", startDate, endDate: startDate, location, htmlLink: "",
      eventType: "default", attendees: [], conferenceUris: [],
    });
    const listEvents = spy(CalendarService, "listEvents").mockResolvedValue([
      event("b", "2026-12-25T15:00:00-03:00", "Casa"),
      event("a", "2026-12-25T09:00:00-03:00"),
      event("a", "2026-12-25T09:00:00-03:00"),
    ]);
    const ctx = makeContext();
    const result = await runTool(calendarTools(ctx), "agenda", { dia: "2026-12-25" });
    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(listEvents).toHaveBeenCalledWith(cal, "2026-12-25T00:00:00-03:00", "2026-12-25T23:59:59-03:00");
    expect(result).toEqual({
      data: "2026-12-25",
      eventos: [
        { titulo: "a", inicio: "2026-12-25T09:00:00-03:00", fim: "2026-12-25T09:00:00-03:00", local: undefined },
        { titulo: "b", inicio: "2026-12-25T15:00:00-03:00", fim: "2026-12-25T15:00:00-03:00", local: "Casa" },
      ],
    });
    expect(ctx.actions[0]?.summary).toBe("Consultou a agenda (2 eventos)");
  });
});

describe("cron tools", () => {
  test("lists readable jobs and runs one with the execute grant", async () => {
    let ran = 0;
    jobRegistry.set("test.voice", { label: "Rotina de teste", schedule: "* * * * *", fn: async () => void ran++ });
    spy(authz, "readableResourceIds").mockResolvedValue(new Set(["test.voice"]));
    const execute = spy(authz, "hasResourceGrant").mockResolvedValue(true);
    const ctx = makeContext();
    const tools = cronTools(ctx);
    expect(await runTool(tools, "listar_rotinas")).toEqual({ rotinas: ["Rotina de teste"] });
    expect(await runTool(tools, "executar_rotina", { rotina: "rotina de teste" })).toMatchObject({ rotina: "Rotina de teste" });
    expect(ran).toBe(1);
    expect(ctx.actions.map((a) => a.summary)).toEqual(["Consultou 1 rotinas", "Executou Rotina de teste"]);

    expect(await runTool(tools, "executar_rotina", { rotina: "outra" })).toHaveProperty("error");
    execute.mockResolvedValue(false);
    expect(await runTool(tools, "executar_rotina", { rotina: "rotina de teste" })).toHaveProperty("error");
    expect(ran).toBe(1);
    jobRegistry.delete("test.voice");
  });
});
