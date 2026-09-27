import Elysia, { status } from "elysia";

import { oauthCallbackQuery } from "./model";
import { GoogleAccountService } from "./service/accounts";

export const googleRoutes = new Elysia({
  prefix: "/api/google",
  detail: {
    tags: ["Google"],
  },
})
  .get(
    "/oauth/start",
    ({ request }) =>
      new Response(null, {
        status: 307,
        headers: { Location: GoogleAccountService.getAuthUrl(request.url) },
      }),
    {
      detail: {
        summary: "Start Google OAuth",
        description: "Redirects to Google's consent screen to link an account.",
      },
    },
  )
  .get(
    "/oauth/callback",
    async ({ request, query }) => {
      const redirectTo = new URL("/", request.url);
      if (!query.code) {
        redirectTo.searchParams.set("googleAccountError", "missing_code");
        return new Response(null, {
          status: 307,
          headers: { Location: redirectTo.toString() },
        });
      }
      try {
        await GoogleAccountService.processCode(query.code, request.url);
        redirectTo.searchParams.set("googleAccountAdded", "1");
      } catch (error) {
        redirectTo.searchParams.set(
          "googleAccountError",
          error instanceof Error ? error.message : String(error),
        );
      }
      return new Response(null, {
        status: 307,
        headers: { Location: redirectTo.toString() },
      });
    },
    {
      detail: {
        summary: "Google OAuth Callback",
        description: "Exchanges the OAuth code and links the Google account.",
      },
      query: oauthCallbackQuery,
    },
  )
  .get(
    "/accounts",
    async () => ({ accounts: await GoogleAccountService.listAccounts() }),
    {
      detail: {
        summary: "List Google Accounts",
        description: "Lists linked Google account emails.",
      },
    },
  )
  .delete(
    "/accounts/:email",
    async ({ params }) => {
      const deleted = await GoogleAccountService.deleteAccount(params.email);
      if (!deleted) return status(404, { error: "Account not found" });
      return { ok: true };
    },
    {
      detail: {
        summary: "Delete Google Account",
        description: "Unlinks a Google account.",
      },
    },
  );
