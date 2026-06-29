import { instrumentableFetch } from "instrumentation";
import type { Calendar } from "./types";
import { getGoogleAccessToken } from "./common";

export async function listCalendarsRequest(traceId: string): Promise<Calendar[]> {
    const accessToken = await getGoogleAccessToken(traceId);
    const url = "https://google.local.gui.dev.br/api/google-calendar/list-calendars";
    const headers = {
        Authorization: "Bearer " + accessToken,
    };
    const response = await instrumentableFetch(traceId, url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch calendars: ${response.statusText}`);
    return (await response.json()) as Calendar[];
}
