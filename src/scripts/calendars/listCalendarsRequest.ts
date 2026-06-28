import { instrumentableFetch } from "instrumentation";
import type { Calendar } from "./types";

export async function listCalendarsRequest(traceId: string): Promise<Calendar[]> {
    const url = "https://google.infra.gui.dev.br/api/google-calendar/list-calendars";
    const headers = {
        Authorization: "Barrissa1#",
    };
    const response = await instrumentableFetch(traceId, url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch calendars: ${response.statusText}`);
    return (await response.json()) as Calendar[];
}
