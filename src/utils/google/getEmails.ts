import { instrumentableFetch } from "instrumentation";
import { buildGoogleServiceUrl, getGoogleAccessToken } from "./common";
import type { EmailListResponse } from "./types";

interface Params {
    q?: string;
    maxResults: number;
    email: string;
    includeSpamTrash?: boolean;
}

export async function getEmails(params: Params, traceId: string): Promise<EmailListResponse[]> {
    const accessToken = await getGoogleAccessToken(traceId);
    const url = buildGoogleServiceUrl("/api/google-gmail/list-emails");
    if (params.q) url.searchParams.set("q", params.q);
    if (params.maxResults) url.searchParams.set("maxResults", String(params.maxResults));
    if (params.email) url.searchParams.set("email", params.email);
    if (params.includeSpamTrash)
        url.searchParams.set("includeSpamTrash", String(params.includeSpamTrash));
    const headers = {
        Authorization: "Bearer " + accessToken,
    };
    const response = await instrumentableFetch(traceId, url.toString(), { headers });
    if (!response.ok) throw new Error("Failed to fetch emails");
    const emails = await response.json();
    return emails as EmailListResponse[];
}
