import safeEnvGet from "@server/safeEnvGet";
import { concatUrlAndResolveTrallingSlash } from "@server/utils/concatUrlAndResolveTrallingSlash";

import Elysia, { redirect, status, StatusMap } from "elysia";
import { z } from "zod";

import { frigateFetch } from "./service/frigate";

export const frigateRoutes = new Elysia({
  prefix: "/api/frigate",
  detail: { tags: ["Frigate"] },
})
  .get(
    "/cameras",
    async (): Promise<string[]> => {
      const res = await frigateFetch("/api/config");
      if (!res.ok) throw status(502, { error: "Frigate indisponível" });
      const config = (await res.json()) as {
        cameras: Record<string, { enabled?: boolean }>;
      };
      return Object.entries(config.cameras)
        .filter(([, camera]) => camera.enabled !== false)
        .map(([name]) => name);
    },
    {
      detail: {
        summary: "List Cameras",
        description: "Lists the enabled Frigate cameras.",
      },
    },
  )
  .get(
    "/cameras/:name/stream",
    async ({ params, request }) => {
      const res = await frigateFetch(
        `/api/go2rtc/api/stream.mp4?src=${params.name}`,
        {
          signal: request.signal,
          // instrumentFetch reads the whole response body to trace it, which
          // never ends for a live stream.
          skipInstrumentation: true,
        },
      );
      if (!res.ok || !res.body) throw status(502, { error: "Stream falhou" });
      // Live fragmented MP4 from go2rtc, piped through untouched; the
      // content-type carries the codec string the <video> needs.
      return new Response(res.body, {
        headers: {
          "content-type": res.headers.get("content-type") ?? "video/mp4",
          "cache-control": "no-store",
        },
      });
    },
    {
      detail: {
        summary: "Camera Stream",
        description:
          "Proxies the go2rtc live MP4 stream, adding the Authentik bearer token.",
      },
      params: z.object({ name: z.string().regex(/^[\w-]+$/) }),
    },
  )
  .get(
    "/cameras/:name/goToFrigate",
    async ({ params }) => {
      return redirect(
        concatUrlAndResolveTrallingSlash(
          safeEnvGet("FRIGATE_ENDPOINT"),
          `/#${params.name}`,
        ),
        StatusMap["Temporary Redirect"],
      );
    },
    {
      detail: {
        summary: "Go to Frigate Camera",
        description:
          "Redirects to the Frigate camera page, adding the Authentik bearer token.",
      },
      params: z.object({ name: z.string().regex(/^[\w-]+$/) }),
    },
  );
