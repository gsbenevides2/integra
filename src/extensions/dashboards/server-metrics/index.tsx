import { useCallback, useEffect, useState } from "react";
import { ServerIcon } from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";
import { useToast } from "core/ui/components/toast";
import { getServerMetricsEdenClient } from "extensions/scripts/server-metrics/client";
import { DiskUsage } from "./component/diskUsage";
import { MemoryChart } from "./component/memoryChart";
import { NetworkChart } from "./component/networkChart";

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

function Dashboard() {
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { showToast } = useToast();

    const fetchHistory = useCallback(
        async (useLoading: boolean) => {
            if (useLoading) setIsLoading(true);
            const client = getServerMetricsEdenClient();
            const { data, error } = await client["server-metrics"].history.get({
                query: {},
            });
            if (error) {
                showToast("Failed to fetch server metrics", "error");
            } else {
                setSnapshots((data?.snapshots as unknown as Snapshot[]) ?? []);
            }
            if (useLoading) setIsLoading(false);
        },
        [showToast],
    );

    useEffect(() => {
        fetchHistory(true);
        const interval = setInterval(() => {
            fetchHistory(false);
        }, 10000);
        return () => clearInterval(interval);
    }, [fetchHistory]);

    const latest = snapshots.at(-1);

    return (
        <div className="p-3 flex flex-col gap-4">
            <h1 className="text-xl">Server Metrics</h1>
            {isLoading ? (
                <p className="text-sm text-mist-400">Carregando métricas...</p>
            ) : snapshots.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <ServerIcon className="size-10 text-mist-500" />
                    <p className="text-mist-200">Ainda não há métricas coletadas</p>
                    <p className="text-sm text-mist-400">
                        Aguarde o próximo ciclo de coleta via SSH.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <MemoryChart data={snapshots} />
                    <NetworkChart data={snapshots} />
                    <div className="lg:col-span-2">
                        <DiskUsage disks={latest?.disks ?? []} />
                    </div>
                </div>
            )}
        </div>
    );
}

export const serverMetricsDashboard: DashboardData = {
    id: "server-metrics",
    content: Dashboard,
    icon: ServerIcon,
    name: "Server Metrics",
};
