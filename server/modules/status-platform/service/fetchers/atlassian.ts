import type { StatusFetcher } from "./types";

interface AtlassianStatusResponse {
  status: {
    indicator: "none" | "minor" | "major" | "critical";
  };
}

interface AtlassianIncidentResponse {
  incidents: {
    incident_updates: Array<{
      body: string;
    }>;
  }[];
}

/**
 * Fetches the status of a status page built with Atlassian Statuspage.
 */
export const fetchFromAtlassianStatuspage: StatusFetcher = async (
  endpoint,
) => {
  const endpointUrl = new URL(endpoint);
  const url = `https://${endpointUrl.host}/api/v2/status.json`;
  const response = await fetch(url);
  const data = (await response.json()) as AtlassianStatusResponse;

  if (data.status.indicator === "none") {
    return { status: "OK" };
  }

  const incidentsResponse = await fetch(
    `https://${endpointUrl.host}/api/v2/incidents/unresolved.json`,
  );
  const incidentsData =
    (await incidentsResponse.json()) as AtlassianIncidentResponse;
  const problemDescription =
    incidentsData.incidents[0]?.incident_updates[0]?.body ??
    "Unknown incident";

  return { status: "DOWN", problemDescription };
};
