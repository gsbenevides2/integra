import { tlsInit } from "./tls";
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
export const fetchFromIncidentIoStatus: StatusFetcher = async (
  endpoint,
  options,
) => {
  const endpointUrl = new URL(endpoint);
  const url = `https://${endpointUrl.host}/proxy/${endpointUrl.host}`;
  const response = await fetch(url, tlsInit(options));
  const data = (await response.json()) as IncidentIoStatusResponse;

  if (data.summary.affected_components.length === 0) {
    return { status: "OK" };
  }

  const incidentsResponse = await fetch(
    `https://${endpointUrl.host}/proxy/${endpointUrl.host}/incidents`,
    tlsInit(options),
  );
  const incidentsData =
    (await incidentsResponse.json()) as IncidentIoIncidentsResponse;
  const problemDescription =
    incidentsData.incidents[0]?.updates[0]?.message_string ??
    "Incidente desconhecido";

  return { status: "DOWN", problemDescription };
};
