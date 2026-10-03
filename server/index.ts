import staticPlugin from "@elysia/static";
import { Elysia, redirect } from "elysia";

import indexHtml from "../public/index.html";
import { registerCrons } from "./cron";
import { instrumentFetch } from "./instrumentation/instrumentFetch";
import { instrumentGaxios } from "./instrumentation/instrumentGaxios";
import { elysiaOtel } from "./instrumentation/instrumentHttpServer";
import { setupLoggerProvider } from "./instrumentation/instrumentLogger";
import { flushTelemetryOnExit } from "./instrumentation/shutdown";
import { authentikRoutes } from "./modules/authentik";
import { cronsRoutes } from "./modules/crons";
import { googleRoutes } from "./modules/google";
import { serverMetricsRoutes } from "./modules/server-metrics";
import { statusPlatformRoutes } from "./modules/status-platform";
import { tplinkRoutes } from "./modules/tplink";
import { trainStatusRoutes } from "./modules/train-status";
import { tuyaRoutes } from "./modules/tuya";
import { startTuyaPulsar } from "./modules/tuya/service/pulsar";
import { openapi } from "./openapi";

instrumentFetch();
setupLoggerProvider();
instrumentGaxios();
flushTelemetryOnExit();

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
  .use(tuyaRoutes)
  .use(googleRoutes)
  .use(trainStatusRoutes)
  .use(statusPlatformRoutes)
  .use(serverMetricsRoutes)
  .use(tplinkRoutes)
  .use(cronsRoutes)
  .use(authentikRoutes);

// The OTEL Plugin overrides native home response.
export const server = Bun.serve({
  port: 3000,
  routes: { "/": indexHtml },
  fetch: app.fetch,
  development: !(process.env.NODE_ENV === "production"),
});

console.log(`🦊 Elysia is running at ${server.hostname}:${server.port}`);

startTuyaPulsar();
registerCrons();
