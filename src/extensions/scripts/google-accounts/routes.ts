import onHttp, { getTraceId } from "core/triggers/http";
import Elysia from "elysia";
import { deleteAccount, getAuthUrl, listAccounts, processCode } from "utils/google/authService";
import z from "zod";

export const googleAccountsElysiaClient = new Elysia({
    prefix: "/google-accounts",
})
    .get("/oauth/start", ({ request, set }) => {
        const url = getAuthUrl(request.url);
        set.status = 307;
        set.headers.location = url;
        return "";
    })
    .get(
        "/oauth/callback",
        async ({ request, query, set }) => {
            if (!query.code) {
                set.status = 307;
                set.headers.location = "/?googleAccountError=missing_code";
                return "";
            }
            try {
                await processCode(query.code, request.url, getTraceId(set.headers));
                set.status = 307;
                set.headers.location = "/?googleAccountAdded=1";
            } catch (error) {
                console.error("Failed to process Google OAuth code", error);
                set.status = 307;
                set.headers.location = "/?googleAccountError=processing_failed";
            }
            return "";
        },
        {
            query: z.object({
                code: z.string().optional(),
            }),
        },
    )
    .get("/accounts", async () => {
        const accounts = await listAccounts();
        return { accounts };
    })
    .delete(
        "/accounts/:email",
        async ({ params, set }) => {
            const deleted = await deleteAccount(params.email);
            if (!deleted) {
                set.status = 404;
                return { success: false };
            }
            return { success: true };
        },
        {
            params: z.object({
                email: z.string(),
            }),
        },
    );

export const googleAccountsRoutes = onHttp(
    {
        id: "google-accounts-routes",
        dontTrace: true,
    },
    googleAccountsElysiaClient,
);
