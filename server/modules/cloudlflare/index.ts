import { authz } from "@server/shared/authz";

import Elysia from "elysia";
import z from "zod";

import { CloudflareRules } from "./service/cloudflarerules";

export const cloudflareRoutes = new Elysia({
  prefix: "/api/cloudflare",
  detail: {
    tags: ["Cloudflare"],
  },
})
  .use(authz)
  .get(
    "/check-bypass",
    async ({ cookie }) => {
      const token = cookie[CloudflareRules.bypass_cookie]?.value;
      if (!token) return { status: false };
      return { status: await CloudflareRules.checkIfIsValid(token) };
    },
    {
      detail: {
        summary: "Verify Bypass",
        description: "Check if bot fight bypass is ok",
      },
      cookie: z.object({
        [CloudflareRules.bypass_cookie]: z.uuidv4().optional(),
      }),
    },
  )
  .post(
    "/toogle-bypass",
    async ({ cookie }) => {
      const currentToken = cookie[CloudflareRules.bypass_cookie].value;
      const isValid = currentToken
        ? await CloudflareRules.checkIfIsValid(currentToken)
        : false;

      if (isValid && currentToken) {
        await CloudflareRules.inativateToken(currentToken);
        cookie[CloudflareRules.bypass_cookie].remove();
      } else {
        const token = await CloudflareRules.createToken();
        cookie[CloudflareRules.bypass_cookie].value = token;
        cookie[CloudflareRules.bypass_cookie].maxAge = 60 * 60 * 24 * 30; // 30 dias
        cookie[CloudflareRules.bypass_cookie].httpOnly = true;
        const serverDevelopmentMode =
          process.env.USE_DEV_HTTP_SERVER === "true";
        cookie[CloudflareRules.bypass_cookie].secure = !serverDevelopmentMode;
      }

      return { ok: true };
    },
    {
      detail: {
        summary: "Togle Bypass",
        description: "Enable/Disable bot fight bypass.",
      },
      cookie: z.object({
        [CloudflareRules.bypass_cookie]: z.uuidv4().optional(),
      }),
    },
  );
