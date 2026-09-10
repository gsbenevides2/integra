import { instrumentableFetch } from "core/instrumentation";
import type { StatusFetcher } from "./types";

const REQUEST_TIMEOUT_MS = 10000;

/**
 * Fetches the status of a generic HTTP endpoint by testing if it returns a 200 status code.
 */
export const fetchFromGenericHttp: StatusFetcher = async (endpoint, traceId) => {
    try {
        const response = await instrumentableFetch(traceId, endpoint, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
