import { z } from "zod";

export const loginFailedBody = z.object({
  body: z.string().meta({
    title: "Body",
    description: "Raw Authentik login_failed event, as its own repr() string",
    example: "login_failed: {'stage': {...}, ...}",
  }),
  severity: z.string(),
  user_email: z.string(),
  user_username: z.string(),
  event_user_email: z.string(),
  event_user_username: z.string(),
});
