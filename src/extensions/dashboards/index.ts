import type { DashboardData } from "core/ui/createDashboard";
import { executionLogsDashboard } from "./execution-logs";
import { googleAccountsDashboard } from "./google-accounts";
import { serverMetricsDashboard } from "./server-metrics";
import { statusPlatformDashboard } from "./status-platform";
import { tpLinkCenterDashboard } from "./tp-link-center";
import { trainStatusDashboard } from "./train-status";
import { tuyaDashboard } from "./tuya";

export const dashboards: DashboardData[] = [
    tuyaDashboard,
    tpLinkCenterDashboard,
    serverMetricsDashboard,
    statusPlatformDashboard,
    trainStatusDashboard,
    executionLogsDashboard,
    googleAccountsDashboard,
];
