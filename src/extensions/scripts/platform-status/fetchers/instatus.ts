import { instrumentableFetch } from "core/instrumentation";
import type { StatusFetcher } from "./types";

interface InstatusSummaryResponse {
    page: {
        status: "UP" | "HASISSUES" | "UNDERMAINTENANCE";
    };
    activeIncidents?: Array<{
        status: "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";
        name: string;
    }>;
}

/**
 * Fetches the status of a status page built with the Instatus Statuspage service.
 */
export const fetchFromInstatusStatuspage: StatusFetcher = async (endpoint, traceId) => {
    const endpointUrl = new URL(endpoint);
    const url = `https://${endpointUrl.host}/summary.json`;
    const response = await instrumentableFetch(traceId, url);
    const data = (await response.json()) as InstatusSummaryResponse;

    const isDown =
        data.page.status === "HASISSUES" && data.activeIncidents && data.activeIncidents.length > 0;

    if (isDown) {
        const problemDescription = data.activeIncidents?.[0]?.name ?? "Unknown incident";
        return { status: "DOWN", problemDescription };
    }

    return { status: "OK" };
};
