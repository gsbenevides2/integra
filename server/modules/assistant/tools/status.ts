import { ServerMetricsService } from "@server/modules/server-metrics/service/collect";
import { StatusPlatformService } from "@server/modules/status-platform/service/platforms";
import { TpLinkChecksService } from "@server/modules/tplink/service/checks";
import { TpLinkDeviceService } from "@server/modules/tplink/service/devices";
import { TpLinkSettingsService } from "@server/modules/tplink/service/settings";
import { TrainStatusService } from "@server/modules/train-status/service/checks";

import { z } from "zod";

import { findByName, guardedTool, isToolError, type ToolContext } from "./guard";

const round = (value: number) => Math.round(value * 10) / 10;

export function statusTools(ctx: ToolContext) {
  return [
    guardedTool(ctx, {
      name: "status_servidor",
      description:
        "Saúde do servidor de casa e da internet: memória, disco, tráfego de rede e o último teste de velocidade (download, upload, latência).",
      routeKeys: [
        "GET /api/server-metrics/latest",
        "GET /api/server-metrics/speedtest/latest",
      ],
      inputSchema: z.object({}),
      execute: async () => {
        const [snapshot, speedtest] = await Promise.all([
          ServerMetricsService.latest(),
          ServerMetricsService.speedtestLatest(),
        ]);
        return {
          servidor: snapshot && {
            memoriaUsadaPercent: round(
              (snapshot.memoryUsedMb / snapshot.memoryTotalMb) * 100,
            ),
            memoriaTotalGb: round(snapshot.memoryTotalMb / 1024),
            redeRecebendoKbs: snapshot.networkRxKbs,
            redeEnviandoKbs: snapshot.networkTxKbs,
            discos: snapshot.disks.map((disk) => ({
              montadoEm: disk.mountedAt,
              usoPercent: disk.usagePercent,
              livreGb: round(disk.freeMb / 1024),
            })),
            coletadoEm: snapshot.collectedAt.toISOString(),
          },
          internet: speedtest && {
            downloadMbps: round(speedtest.downloadMbps),
            uploadMbps: round(speedtest.uploadMbps),
            latenciaMs: round(speedtest.latencyMs),
            medidoEm: speedtest.collectedAt.toISOString(),
          },
        };
      },
      summarize: () => "Consultou o status do servidor",
    }),
    guardedTool(ctx, {
      name: "status_plataformas",
      description:
        "Status das plataformas monitoradas (GitHub, Cloudflare, Shopify etc.). Sem nome, traz todas; destaque as que estão com problema.",
      routeKeys: ["GET /api/status-platform/list"],
      inputSchema: z.object({
        plataforma: z.string().optional().describe("Nome de uma plataforma específica"),
      }),
      execute: async ({ plataforma }) => {
        const all = await StatusPlatformService.list();
        const selected = plataforma
          ? findByName(all, plataforma, "plataforma")
          : null;
        if (isToolError(selected)) return selected;
        return {
          plataformas: (selected ? [selected] : all).map((p) => ({
            nome: p.name,
            status: p.status,
            problema: p.problemDescription,
            verificadoEm: p.lastCheckedAt,
          })),
        };
      },
      summarize: (_input, output) =>
        `Consultou ${output.plataformas.length} plataformas`,
    }),
    guardedTool(ctx, {
      name: "status_linhas_trem",
      description:
        "Situação atual das linhas de trem e metrô de São Paulo (operação normal, velocidade reduzida, paralisada...).",
      routeKeys: ["GET /api/train-status/lines"],
      inputSchema: z.object({}),
      execute: async () => ({
        linhas: (await TrainStatusService.listLatest()).map((line) => ({
          linha: line.lineCode,
          cor: line.lineColor,
          situacao: line.situation,
          status: line.status,
          descricao: line.description,
        })),
      }),
      summarize: () => "Consultou as linhas de trem",
    }),
    guardedTool(ctx, {
      name: "status_roteador",
      description:
        "Status do roteador TP-Link: conexão com a internet, IP externo, tempo ligado, uso de CPU e memória.",
      routeKeys: ["GET /api/tplink/settings/latest-router-status"],
      inputSchema: z.object({}),
      execute: async () => {
        const status = await TpLinkSettingsService.getLatestRouterStatus();
        return {
          conexao: status.connectionStatus,
          ipExterno: status.wanIp,
          conexaoAtivaHa: status.connectionUptime,
          roteadorLigadoHa: status.routerUptime,
          cpuPercent: status.cpuUsage,
          memoriaPercent: status.memoryUsage,
        };
      },
      summarize: () => "Consultou o roteador",
    }),
    guardedTool(ctx, {
      name: "dispositivos_conectados",
      description: "Quais aparelhos estão conectados na rede de casa agora.",
      routeKeys: ["GET /api/tplink/checks/latest"],
      inputSchema: z.object({}),
      execute: async () => {
        const check = await TpLinkChecksService.getLatestCheck();
        const names = await TpLinkDeviceService.getDeviceNamesByMacs(
          check.devices.map((d) => d.mac),
        );
        return {
          verificadoEm: new Date(check.createdAt).toISOString(),
          total: check.devices.length,
          dispositivos: check.devices.map(
            (d) => names.get(d.mac) ?? (d.name || d.vendor || d.mac),
          ),
        };
      },
      summarize: (_input, output) => `${output.total} aparelhos conectados`,
    }),
  ];
}
