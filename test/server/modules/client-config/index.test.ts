import { clientConfigRoutes, getClientConfig } from "@server/modules/client-config";
import { version } from "@server/utils/getProjectInfo";

import { describe, expect, test } from "bun:test";

const RUM_ENV = {
  PUBLIC_RUM_TOKEN: "token",
  PUBLIC_RUM_SITE: "openobserve.example.com",
  PUBLIC_OTEL_ORGANIZATION: "org",
};

describe("getClientConfig", () => {
  test("returns the RUM settings when configured", () => {
    expect(getClientConfig({ ...RUM_ENV, NODE_ENV: "production" })).toEqual({
      version,
      rum: {
        clientToken: "token",
        site: "openobserve.example.com",
        organization: "org",
        env: "production",
      },
    });
  });

  test("reports development outside production", () => {
    expect(getClientConfig({ ...RUM_ENV, NODE_ENV: "test" }).rum?.env).toBe("development");
  });

  test("returns null RUM when any setting is missing", () => {
    expect(getClientConfig({ ...RUM_ENV, PUBLIC_RUM_TOKEN: "" }).rum).toBeNull();
    expect(getClientConfig({}).rum).toBeNull();
  });
});

describe("GET /client-config", () => {
  test("answers without identity headers", async () => {
    const response = await clientConfigRoutes.handle(
      new Request("http://localhost/client-config"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { version: string };
    expect(body.version).toBe(version);
  });
});
