import Elysia from "elysia";
import { z } from "zod";

import { TrainStatusService } from "./service/checks";

export const trainStatusRoutes = new Elysia({
  prefix: "/api/train-status",
  detail: {
    tags: ["TrainStatus"],
  },
})
  .get("/lines", () => TrainStatusService.listLatest(), {
    detail: {
      summary: "List Train Lines",
      description: "Latest status check for every tracked train line.",
    },
  })
  .get(
    "/:code/history",
    ({ params, query }) => {
      const before = query.before ? new Date(query.before) : new Date();
      return TrainStatusService.getHistory(Number(params.code), before);
    },
    {
      params: z.object({
        code: z.string().meta({
          title: "Line Code",
          description: "The train line's numeric code.",
          example: "1",
        }),
      }),
      query: z.object({
        before: z.string().optional().meta({
          title: "Before",
          description: "ISO timestamp cursor; returns checks before it.",
        }),
      }),
      detail: {
        summary: "Train Line History",
        description: "Paginated status history and segments for a line.",
      },
    },
  );
