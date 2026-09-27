import { ServerMetricsService } from "../service/collect";

export async function collectServerMetrics(): Promise<void> {
  await ServerMetricsService.collect();
}

export async function collectSpeedtest(): Promise<void> {
  await ServerMetricsService.collectSpeedtest();
}
