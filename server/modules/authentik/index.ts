import { authz } from "@server/shared/authz";
import { sendGotifyMessage } from "@server/shared/gotify";

import Elysia from "elysia";

import { loginFailedBody } from "./model";
import { generateMessage } from "./service/message";

export const authentikRoutes = new Elysia({
  prefix: "/api/authentik",
  detail: {
    tags: ["Authentik"],
  },
})
  .use(authz)
  .post(
  "/login-failed",
  async ({ body }) => {
    const message = generateMessage(
      body.body,
      body.event_user_email,
      body.event_user_username,
    );
    await sendGotifyMessage(message);
    return "OK";
  },
  {
    body: loginFailedBody,
    detail: {
      summary: "Authentik Login Failed Webhook",
      description:
        "Receives Authentik's login_failed notification webhook and posts an alert to Gotify.",
    },
  },
);
