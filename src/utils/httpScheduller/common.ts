import { loginInAuthentik } from "utils/authentik/login";

export async function getHttpSchedullerAccessToken(traceId: string) {
    const { access_token } = await loginInAuthentik(
        {
            client_id: "BosazxWMVtAeXMfI7Hm5lPt3Crr5FFFWXdCdQtan",
        },
        traceId,
    );
    return access_token;
}
