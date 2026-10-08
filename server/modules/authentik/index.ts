import { sendDiscordMessage } from "@server/shared/discord";
import { sendEvolutionMessage } from "@server/shared/evolution";

import Elysia from "elysia";

import { loginFailedBody } from "./model";
import { generateMessage } from "./service/message";

export const authentikRoutes = new Elysia({
  prefix: "/api/authentik",
  detail: {
    tags: ["Authentik"],
  },
}).post(
  "/login-failed",
  async ({ body }) => {
    const message = generateMessage(
      body.body,
      body.event_user_email,
      body.event_user_username,
    );
    await sendDiscordMessage(message);
    await sendEvolutionMessage(message);
    return "OK";
  },
  {
    body: loginFailedBody,
    detail: {
      summary: "Authentik Login Failed Webhook",
      description:
        "Receives Authentik's login_failed notification webhook and posts an alert to Discord.",
    },
  },
);
