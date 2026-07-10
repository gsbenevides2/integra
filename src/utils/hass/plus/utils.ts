import { loginInAuthentik } from "utils/authentik/login";
import safeEnvGet from "utils/safeEnvGet";

export const HA_PLUS_SERVICE_URL = safeEnvGet("HA_PLUS_SERVICE_URL");
export const HA_PLUS_SERVICE_CLIENT_ID = safeEnvGet("HA_PLUS_SERVICE_CLIENT_ID");

export const buildHaPlusServiceUrl = (path: string) => {
    return `${HA_PLUS_SERVICE_URL}${path}`;
};

export async function getHaPlusAccessToken(traceId: string) {
    const { access_token } = await loginInAuthentik(
        {
            client_id: HA_PLUS_SERVICE_CLIENT_ID,
        },
        traceId,
    );
    return access_token;
}
