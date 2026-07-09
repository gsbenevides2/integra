import { loginInAuthentik } from "utils/authentik/login";
import safeEnvGet from "utils/safeEnvGet";

const googleServiceClientId = safeEnvGet("GOOGLE_SERVICE_CLIENT_ID");
const googleServiceEndpoint = safeEnvGet("GOOGLE_SERVICE_ENDPOINT");

export function buildGoogleServiceUrl(pathname: string) {
    return new URL(pathname, googleServiceEndpoint);
}

export async function getGoogleAccessToken(traceId: string) {
    const { access_token } = await loginInAuthentik(
        {
            client_id: googleServiceClientId,
        },
        traceId,
    );
    return access_token;
}
