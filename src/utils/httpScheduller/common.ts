import { treaty } from "@elysia/eden";
import type { App } from "@gsbenevides2/http-scheduller";
import { getBunFetchInstrumentableFetchClient } from "core/instrumentation";
import { loginInAuthentik } from "utils/authentik/login";
import safeEnvGet from "utils/safeEnvGet";

const httpSchedullerClientId = safeEnvGet("HTTP_SCHEDULLER_CLIENT_ID");
const httpSchedullerServiceEndpoint = safeEnvGet("HTTP_SCHEDULLER_SERVICE_ENDPOINT");

export function buildHttpSchedullerUrl(pathname: string = "/api/http-scheduller") {
    return new URL(pathname, httpSchedullerServiceEndpoint);
}

export async function getHttpSchedullerAccessToken(traceId: string) {
    const { access_token } = await loginInAuthentik(
        {
            client_id: httpSchedullerClientId,
        },
        traceId,
    );
    return access_token;
}

export async function getClient(traceId: string) {
    const accessToken = await getHttpSchedullerAccessToken(traceId);
    const app = treaty<App>(httpSchedullerServiceEndpoint, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        fetcher: getBunFetchInstrumentableFetchClient(traceId),
    });
    return app;
}
