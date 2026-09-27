import React, { useCallback, useEffect, useState } from "react";

import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import { Bars3Icon, ServerIcon } from "@heroicons/react/24/outline";

import { getServerMetricsEdenClient } from "./client";
import { DiskUsage } from "./component/DiskUsage";
import { MemoryChart } from "./component/MemoryChart";
import { NetworkChart } from "./component/NetworkChart";
import { SpeedtestChart } from "./component/SpeedtestChart";
import { SpeedtestLatest } from "./component/SpeedtestLatest";

const POLL_INTERVAL_MS = 10000;

interface Snapshot {
  id: string;
  memoryTotalMb: number;
  memoryUsedMb: number;
  memoryFreeMb: number;
  networkRxKbs: number;
  networkTxKbs: number;
  disks: {
    filesystem: string;
    totalMb: number;
    usedMb: number;
    freeMb: number;
    usagePercent: number;
    mountedAt: string;
  }[];
  collectedAt: string;
}

interface SpeedtestSnapshot {
  id: string;
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  collectedAt: string;
}

export function ServerMetricsDashboard() {
  const { showToast } = useToast();
  const globalDrawer = useGlobalDrawer();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [speedtestSnapshots, setSpeedtestSnapshots] = useState<SpeedtestSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(
    async (useLoading: boolean) => {
      if (useLoading) setIsLoading(true);
      const client = getServerMetricsEdenClient();
      const [{ data, error }, { data: speedtestData, error: speedtestError }] =
        await Promise.all([
          client.api["server-metrics"].history.get({ query: {} }),
          client.api["server-metrics"].speedtest.history.get({ query: {} }),
        ]);
      if (error) {
        showToast("Falha ao buscar métricas do servidor", "error");
      } else {
        setSnapshots((data?.snapshots as unknown as Snapshot[]) ?? []);
      }
      if (speedtestError) {
        showToast("Falha ao buscar histórico de velocidade", "error");
      } else {
        setSpeedtestSnapshots(
          (speedtestData?.snapshots as unknown as SpeedtestSnapshot[]) ?? [],
        );
      }
      if (useLoading) setIsLoading(false);
    },
    [showToast],
  );

  useEffect(() => {
    fetchHistory(true);
    const interval = setInterval(() => fetchHistory(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const latest = snapshots.at(-1);
  const latestSpeedtest = speedtestSnapshots.at(-1) ?? null;

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2">
        <IconButton
          onClick={() => globalDrawer.setIsOpen(true)}
          aria-label="Abrir menu"
        >
          <Bars3Icon className="size-5" />
        </IconButton>
        <h1 className="text-xl">Server Metrics</h1>
      </div>
      {isLoading ? (
        <p className="text-sm text-mist-400">Carregando métricas...</p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <SpeedtestLatest latest={latestSpeedtest} />
            {speedtestSnapshots.length > 0 && (
              <SpeedtestChart data={speedtestSnapshots} />
            )}
          </div>

          {snapshots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ServerIcon className="size-10 text-mist-500" />
              <p className="text-mist-200">Ainda não há métricas coletadas</p>
              <p className="text-sm text-mist-400">
                Aguarde o próximo ciclo de coleta via SSH.
              </p>
            </div>
          ) : (
            <div className="
              grid grid-cols-1 gap-3
              lg:grid-cols-2
            ">
              <MemoryChart data={snapshots} />
              <NetworkChart data={snapshots} />
              <div className="lg:col-span-2">
                <DiskUsage disks={latest?.disks ?? []} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const serverMetricsDashboard: DashboardData = {
  id: "server-metrics",
  content: ServerMetricsDashboard,
  icon: ServerIcon,
  name: "Server Metrics",
};
