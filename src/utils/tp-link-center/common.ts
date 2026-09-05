import { treaty } from "@elysia/eden";
import type { app } from "@gsbenevides2/tp-link-center";
import { getBunFetchInstrumentableFetchClient } from "instrumentation";
import { loginInAuthentik } from "utils/authentik/login";
import safeEnvGet from "utils/safeEnvGet";

type App = typeof app;

const tpLinkCenterClientId = safeEnvGet("TP_LINK_CENTER_CLIENT_ID");
const tpLinkCenterServiceEndpoint = safeEnvGet("TP_LINK_CENTER_SERVICE_ENDPOINT");

export async function getTpLinkCenterAccessToken(traceId: string) {
    const { access_token } = await loginInAuthentik(
        {
            client_id: tpLinkCenterClientId,
        },
        traceId,
    );
    return access_token;
}

export async function getTPLinkClient(traceId: string) {
    const accessToken = await getTpLinkCenterAccessToken(traceId);
    const client = treaty<App>(tpLinkCenterServiceEndpoint, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        fetcher: getBunFetchInstrumentableFetchClient(traceId),
    });
    return client;
}
