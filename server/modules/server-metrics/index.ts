import Elysia from "elysia";

import { historyQuery } from "./model";
import { ServerMetricsService } from "./service/collect";

export const serverMetricsRoutes = new Elysia({
  prefix: "/api/server-metrics",
  detail: {
    tags: ["ServerMetrics"],
  },
})
  .get("/latest", () => ServerMetricsService.latest(), {
    detail: {
      summary: "Latest Server Snapshot",
      description: "Most recent memory/network/disk snapshot collected over SSH.",
    },
  })
  .get(
    "/history",
    ({ query }) =>
      ServerMetricsService.history(query.before ? new Date(query.before) : undefined),
    {
      query: historyQuery,
      detail: {
        summary: "Server Snapshot History",
        description: "Paginated history of collected server snapshots, oldest first.",
      },
    },
  )
  .get("/speedtest/latest", () => ServerMetricsService.speedtestLatest(), {
    detail: {
      summary: "Latest Speedtest",
      description: "Most recent Cloudflare speedtest result.",
    },
  })
  .get(
    "/speedtest/history",
    ({ query }) =>
      ServerMetricsService.speedtestHistory(
        query.before ? new Date(query.before) : undefined,
      ),
    {
      query: historyQuery,
      detail: {
        summary: "Speedtest History",
        description: "Paginated history of Cloudflare speedtest results, oldest first.",
      },
    },
  );
