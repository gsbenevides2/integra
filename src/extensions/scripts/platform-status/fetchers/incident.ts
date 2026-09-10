import { instrumentableFetch } from "core/instrumentation";
import type { StatusFetcher } from "./types";

interface IncidentIoStatusResponse {
    summary: {
        affected_components: Array<unknown>;
    };
}

interface IncidentIoIncidentsResponse {
    incidents: Array<{
        name: string;
        updates: Array<{
            message_string: string;
        }>;
    }>;
}

/**
 * Fetches the status of a status page built with the Incident.io service.
 */
export const fetchFromIncidentIoStatus: StatusFetcher = async (endpoint, traceId) => {
    const endpointUrl = new URL(endpoint);
    const url = `https://${endpointUrl.host}/proxy/${endpointUrl.host}`;
    const response = await instrumentableFetch(traceId, url);
    const data = (await response.json()) as IncidentIoStatusResponse;

    if (data.summary.affected_components.length === 0) {
        return { status: "OK" };
    }

    const incidentsResponse = await instrumentableFetch(
        traceId,
        `https://${endpointUrl.host}/proxy/${endpointUrl.host}/incidents`,
    );
    const incidentsData = (await incidentsResponse.json()) as IncidentIoIncidentsResponse;
    const problemDescription =
        incidentsData.incidents[0]?.updates[0]?.message_string ?? "Unknown incident";

    return { status: "DOWN", problemDescription };
};
