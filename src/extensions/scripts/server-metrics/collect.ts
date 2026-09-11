import { db } from "core/db";
import { serverMetricsSnapshots, type DiskSnapshot } from "extensions/db/server-metrics";
import { getServerStatus } from "utils/ssh/getServerStatus";

function parseUnitValue(value: string): number {
    return Number(value.replace(/[^0-9.]/g, ""));
}

export async function collectServerMetrics(traceId: string) {
    const status = await getServerStatus(traceId);
    const collectedAt = new Date();

    const disks: DiskSnapshot[] = status.discos.map((disk) => ({
        filesystem: disk.filesystem,
        totalMb: parseUnitValue(disk.total),
        usedMb: parseUnitValue(disk.usado),
        freeMb: parseUnitValue(disk.livre),
        usagePercent: parseUnitValue(disk.uso_porcentagem),
        mountedAt: disk.montado_em,
    }));

    await db.insert(serverMetricsSnapshots).values({
        memoryTotalMb: Math.round(Number(status.memoria.total_mb)),
        memoryUsedMb: Math.round(Number(status.memoria.usada_mb)),
        memoryFreeMb: Math.round(
            Number(status.memoria.total_mb) - Number(status.memoria.usada_mb),
        ),
        networkRxKbs: Math.round(Number(status.rede.rx_kbs)),
        networkTxKbs: Math.round(Number(status.rede.tx_kbs)),
        disks,
        collectedAt,
    });
}
