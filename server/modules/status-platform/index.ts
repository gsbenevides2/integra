import Elysia from "elysia";

import { historyQuery, platformBody } from "./model";
import { StatusPlatformService } from "./service/platforms";

export const statusPlatformRoutes = new Elysia({
  prefix: "/api/status-platform",
  detail: {
    tags: ["StatusPlatform"],
  },
})
  .get("/list", () => StatusPlatformService.list(), {
    detail: {
      summary: "List Platforms",
      description: "Lists all monitored platforms with their latest status.",
    },
  })
  .get(
    "/:id/history",
    ({ params, query }) =>
      StatusPlatformService.getHistory(params.id, query.before),
    {
      detail: {
        summary: "Platform History",
        description: "Paginated status-check history for one platform.",
      },
      query: historyQuery,
    },
  )
  .post("/", ({ body }) => StatusPlatformService.create(body), {
    detail: {
      summary: "Create Platform",
      description: "Registers a new platform and checks it immediately.",
    },
    body: platformBody,
  })
  .patch(
    "/:id",
    ({ params, body }) => StatusPlatformService.update(params.id, body),
    {
      detail: {
        summary: "Update Platform",
        description: "Updates a platform and re-checks it immediately.",
      },
      body: platformBody,
    },
  )
  .delete("/:id", ({ params }) => StatusPlatformService.remove(params.id), {
    detail: {
      summary: "Delete Platform",
      description: "Removes a platform and its check history.",
    },
  });
