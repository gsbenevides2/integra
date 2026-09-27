import { z } from "zod";

export const oauthCallbackQuery = z.object({
  code: z.string().optional().meta({
    title: "Code",
    description: "OAuth authorization code returned by Google",
    example: "4/0AY0e-g6...",
  }),
});
