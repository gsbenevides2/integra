import type { DashboardData } from "core/ui/createDashboard";
import { statusPlatformDashboard } from "./status-platform";
import { trainStatusDashboard } from "./train-status";

export const dashboards: DashboardData[] = [statusPlatformDashboard, trainStatusDashboard];
