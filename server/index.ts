import staticPlugin from "@elysia/static";
import { Elysia, redirect } from "elysia";

import { registerCrons } from "./cron";
import { instrumentFetch } from "./instrumentation/instrumentFetch";
import { instrumentGaxios } from "./instrumentation/instrumentGaxios";
import { elysiaOtel } from "./instrumentation/instrumentHttpServer";
import {
  getLogger,
  logWarn,
  setupLoggerProvider,
} from "./instrumentation/instrumentLogger";
import { flushTelemetryOnExit } from "./instrumentation/shutdown";
import { assistantRoutes, voskAssetRoutes } from "./modules/assistant";
import { authentikRoutes } from "./modules/authentik";
import { clientConfigRoutes } from "./modules/client-config";
import { cloudflareRoutes } from "./modules/cloudlflare";
import { cronsRoutes } from "./modules/crons";
import { frigateRoutes } from "./modules/frigate";
import { googleRoutes } from "./modules/google";
import { motivaTrilhosRoutes } from "./modules/motiva-trilhos";
import { nearbyBusRoutes } from "./modules/nearby-bus";
import { meRoutes, permissionsRoutes } from "./modules/permissions";
import { runAuthzStartupChecks } from "./modules/permissions/service";
import { serverMetricsRoutes } from "./modules/server-metrics";
import { statusPlatformRoutes } from "./modules/status-platform";
import { tplinkRoutes } from "./modules/tplink";
import { trainStatusRoutes } from "./modules/train-status";
import { tuyaRoutes } from "./modules/tuya";
import { startTuyaPulsar } from "./modules/tuya/service/pulsar";
import { openapi } from "./openapi";
import { registerGuardedRoutes, warnDevOverrideConfig } from "./shared/authz";

instrumentFetch();
setupLoggerProvider();
instrumentGaxios();
flushTelemetryOnExit();

// Production images prebuild the frontend (`bun run build:web`); otherwise
// (dev) Bun bundles public/index.html on the fly.
const WEB_DIST = "dist/web";
// Not a literal: keeps `bun build` from bundling the HTML (and its frontend) into the server.
const DEV_HTML = "../public/index.html";
const prebuilt = await Bun.file(`${WEB_DIST}/index.html`).exists();

const sw = await Bun.build({ entrypoints: ["public/sw.ts"] });
const swJs = await sw.outputs[0]!.text();

export const app = new Elysia()
  .use(elysiaOtel)
  .use(openapi)
  .get("/favicon.ico", () => redirect("/icons/favicon.ico"))
  .get(
    "/sw.js",
    () =>
      new Response(swJs, { headers: { "content-type": "text/javascript" } }),
  )
  .use(
    await staticPlugin({
      prefix: "/",
      bunFullstack: false,
      detail: {
        tags: ["FrontEnd"],
        hide: true,
      },
    }),
  )
  .use(prebuilt ? await staticPlugin({ assets: WEB_DIST, prefix: "/", detail: { hide: true } }) : new Elysia())
  .use(voskAssetRoutes)
  .use(clientConfigRoutes)
  .use(tuyaRoutes)
  .use(frigateRoutes)
  .use(googleRoutes)
  .use(trainStatusRoutes)
  .use(nearbyBusRoutes)
  .use(motivaTrilhosRoutes)
  .use(statusPlatformRoutes)
  .use(serverMetricsRoutes)
  .use(tplinkRoutes)
  .use(cronsRoutes)
  .use(assistantRoutes)
  .use(authentikRoutes)
  .use(meRoutes)
  .use(cloudflareRoutes)
  .use(permissionsRoutes);

registerGuardedRoutes(app);

const devOverrideWarning = warnDevOverrideConfig();
if (devOverrideWarning) {
  logWarn(getLogger("authz"), devOverrideWarning);
}
// The checks handle database errors themselves; this only guards against an
// unexpected bug turning into an unhandled rejection at startup.
void runAuthzStartupChecks().catch((error: unknown) => {
  logWarn(getLogger("authz"), "[authz] startup checks failed unexpectedly", {
    "error.message": error instanceof Error ? error.message : String(error),
  });
});

const serverDevelopmentMode = process.env.USE_DEV_HTTP_SERVER === "true";

// The OTEL Plugin overrides native home response.
export const server = Bun.serve({
  port: 3000,
  routes: {
    "/": prebuilt
      ? new Response(Bun.file(`${WEB_DIST}/index.html`))
      : (await import(DEV_HTML)).default,
  },
  fetch: app.fetch,
  development: serverDevelopmentMode,
  // Largest legitimate body is an image upload (MAX_IMAGE_BYTES, 10 MB);
  // Bun's default (128 MB) lets oversized bodies be buffered before validation.
  maxRequestBodySize: 12 * 1024 * 1024,
});

console.log(`🦊 Elysia is running at ${server.hostname}:${server.port}`);

startTuyaPulsar();
registerCrons();
