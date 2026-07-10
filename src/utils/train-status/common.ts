import { loginInAuthentik } from "utils/authentik/login";
import safeEnvGet from "utils/safeEnvGet";

export const TRAIN_STATUS_CLIENT_ID = safeEnvGet("TRAIN_STATUS_CLIENT_ID");
export const TRAIN_STATUS_URL = safeEnvGet("TRAIN_STATUS_URL");

export const buildTrainStatusUrl = (path: string) => {
    return `${TRAIN_STATUS_URL}${path}`;
};

export async function getStatusAccessToken(traceId: string) {
    const { access_token } = await loginInAuthentik(
        {
            client_id: TRAIN_STATUS_CLIENT_ID,
        },
        traceId,
    );
    return access_token;
}
