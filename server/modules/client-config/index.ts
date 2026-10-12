import { version } from "@server/utils/getProjectInfo";

import { Elysia } from "elysia";

/** What a native client (the Android app) needs before it knows the user. */
export interface ClientConfig {
  version: string;
  /** OpenObserve RUM. Null when the server has no RUM configured. */
  rum: {
    clientToken: string;
    site: string;
    organization: string;
    env: string;
  } | null;
}

export function getClientConfig(env: NodeJS.ProcessEnv = process.env): ClientConfig {
  const clientToken = env.PUBLIC_RUM_TOKEN;
  const site = env.PUBLIC_RUM_SITE;
  const organization = env.PUBLIC_OTEL_ORGANIZATION;
  return {
    version,
    rum:
      clientToken && site && organization
        ? {
          clientToken,
          site,
          organization,
          env: env.NODE_ENV === "production" ? "production" : "development",
        }
        : null,
  };
}

/**
 * Public (outside `/api/`, so outside the authz guard): the Android app reads
 * it to start RUM before it has signed in. It only carries the RUM client
 * token, which the web bundle already exposes.
 */
export const clientConfigRoutes = new Elysia({
  detail: { tags: ["Client"] },
}).get("/client-config", () => getClientConfig(), {
  detail: {
    summary: "Native client configuration",
    description:
      "Public settings for native clients: the app version and the OpenObserve RUM client token, site and organization.",
  },
});
