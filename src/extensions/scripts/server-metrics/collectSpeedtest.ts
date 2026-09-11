import { db } from "core/db";
import { serverMetricsSpeedtestSnapshots } from "extensions/db/server-metrics";
import { runCloudflareSpeedtest } from "utils/cloudflareSpeedtest";

export async function collectSpeedtest() {
    const { downloadMbps, uploadMbps, latencyMs } = await runCloudflareSpeedtest();

    await db.insert(serverMetricsSpeedtestSnapshots).values({
        downloadMbps,
        uploadMbps,
        latencyMs,
        collectedAt: new Date(),
    });
}
