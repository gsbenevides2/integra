import z from "zod";

export const loginFailedBody = z.object({
    body: z.string(),
    severity: z.string(),
    user_email: z.email(),
    user_username: z.string(),
    event_user_email: z.email(),
    event_user_username: z.string(),
});
