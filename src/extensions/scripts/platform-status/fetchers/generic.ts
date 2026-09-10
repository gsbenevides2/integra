import { instrumentableFetch } from "core/instrumentation";
import type { StatusFetcher } from "./types";

const REQUEST_TIMEOUT_MS = 20000;

/**
 * Fetches the status of a generic HTTP endpoint by testing if it returns a 200 status code.
 */
export const fetchFromGenericHttp: StatusFetcher = async (endpoint, traceId) => {
    try {
        const response = await instrumentableFetch(traceId, endpoint, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            },
        });

        if (response.status === 200) {
            return { status: "OK" };
        }

        return {
            status: "DOWN",
            problemDescription: `HTTP status code ${response.status} received instead of 200`,
        };
    } catch (error) {
        const problemDescription =
            error instanceof Error && error.name === "TimeoutError"
                ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`
                : error instanceof Error
                  ? error.message
                  : "Unknown error occurred";

        return { status: "DOWN", problemDescription };
    }
};
