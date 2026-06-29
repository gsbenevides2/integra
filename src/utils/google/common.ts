import { loginInAuthentik } from "utils/authentik/login";

export async function getGoogleAccessToken(traceId: string) {
    const { access_token } = await loginInAuthentik(
        {
            client_id: "lbuahPNamVXaP9bHpJRNcHssfiGarPeg4EY0HmD5",
        },
        traceId,
    );
    return access_token;
}
