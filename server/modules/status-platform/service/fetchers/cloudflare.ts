import type { StatusFetcher } from "./types";

interface CloudflareStatusResponse {
  status: {
    indicator: "none" | "minor" | "major" | "critical";
    description: string;
  };
  incidents?: Array<{
    name: string;
    status: string;
  }>;
}

/**
 * Fetches the status of Cloudflare services from the Cloudflare Status API.
 * https://www.cloudflarestatus.com/
 */
export const fetchFromCloudflareStatus: StatusFetcher = async () => {
  try {
    const response = await fetch(
      "https://www.cloudflarestatus.com/api/v2/status.json",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
      },
    );

    if (!response.ok) {
      return {
        status: "DOWN",
        problemDescription: `Cloudflare API returned ${response.status}`,
      };
    }

    const data = (await response.json()) as CloudflareStatusResponse;

    if (data.status.indicator === "none") {
      return { status: "OK" };
    }

    const problemDescription =
      data.status.description || `Status: ${data.status.indicator}`;
    return { status: "DOWN", problemDescription };
  } catch (error) {
    const problemDescription =
      error instanceof Error && error.name === "TimeoutError"
        ? "Request timed out"
        : error instanceof Error
          ? error.message
          : "Unknown error occurred";

    return { status: "DOWN", problemDescription };
  }
};
