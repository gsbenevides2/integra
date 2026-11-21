/**
 * Name every frontend signal carries: the RUM application, the logs service,
 * `service.name` on the trace resource, and the source maps uploaded by
 * `bun run sourcemaps:upload`. OpenObserve matches a source map to an error
 * stack trace on the exact `service`/`env`/`version` triple, so this constant
 * is the single source of truth for the first one.
 */
export const RUM_SERVICE_NAME = "integra-web";
