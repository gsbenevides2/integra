import { instrumentableFetch } from "core/instrumentation";
import type { EmailResponse } from "./types";
import { buildGoogleServiceUrl, getGoogleAccessToken } from "./common";

export async function getEmail(
    email: string,
    messageId: string,
    traceId: string,
): Promise<EmailResponse> {
    const accessToken = await getGoogleAccessToken(traceId);
    const url = buildGoogleServiceUrl("/api/google-gmail/get-email-by-id");
    const headers = {
        Authorization: "Bearer " + accessToken,
    };
    url.searchParams.set("email", email);
    url.searchParams.set("messageId", messageId);
    url.searchParams.set("format", "full");
    const response = await instrumentableFetch(traceId, url.toString(), { headers });
    if (!response.ok) throw new Error("Failed to fetch email");
    const emailRes = await response.json();
    return emailRes as EmailResponse;
}
