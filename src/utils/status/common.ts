import { loginInAuthentik } from "utils/authentik/login";
import safeEnvGet from "utils/safeEnvGet";

export const PLATAFORM_STATUS_CLIENT_ID = safeEnvGet("PLATAFORM_STATUS_CLIENT_ID");
export const PLATAFORM_STATUS_URL = safeEnvGet("PLATAFORM_STATUS_URL");

export const buildPlataformStatusUrl = (path: string) => {
    return `${PLATAFORM_STATUS_URL}${path}`;
};

export async function getStatusAccessToken(traceId: string) {
    const { access_token } = await loginInAuthentik(
        {
            client_id: PLATAFORM_STATUS_CLIENT_ID,
        },
        traceId,
    );
    return access_token;
}
