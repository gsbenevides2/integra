import { authz } from "@server/shared/authz";

import Elysia, { status } from "elysia";

import { eventBody } from "./model";
import { BirthdayService } from "./service/events";

const NOT_FOUND = { error: "Event not found" };

export const birthdayRoutes = new Elysia({
  prefix: "/api/birthday",
  detail: {
    tags: ["Birthday"],
  },
})
  .use(authz)
  .get("/list", () => BirthdayService.list(), {
    detail: {
      summary: "List Birthday Events",
      description: "All yearly-recurring birthday events, ordered by month and day.",
    },
  })
  .post("/", async ({ body }) => (await BirthdayService.create(body))[0], {
    detail: {
      summary: "Create Birthday Event",
      description: "Adds a birthday event (day and month only; it repeats every year).",
    },
    body: eventBody,
  })
  .patch(
    "/:id",
    async ({ params, body }) =>
      (await BirthdayService.update(params.id, body)) ?? status(404, NOT_FOUND),
    {
      detail: {
        summary: "Update Birthday Event",
        description: "Replaces title, month and day of an event.",
      },
      body: eventBody,
    },
  )
  .delete(
    "/:id",
    async ({ params }) =>
      (await BirthdayService.remove(params.id)) ?? status(404, NOT_FOUND),
    {
      detail: {
        summary: "Delete Birthday Event",
        description: "Removes a birthday event.",
      },
    },
  );
