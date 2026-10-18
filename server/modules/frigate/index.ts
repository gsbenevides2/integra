import safeEnvGet from "@server/safeEnvGet";
import {
  authz,
  currentUser,
  readableResourceIds,
} from "@server/shared/authz";
import { concatUrlAndResolveTrallingSlash } from "@server/utils/concatUrlAndResolveTrallingSlash";

import Elysia, { redirect, status, StatusMap } from "elysia";
import { z } from "zod";

import {
  CAMERA_FEATURES,
  cameraLiveConfig,
  frigateFetch,
  frigateLiveStream,
  frigateStats,
  listEnabledCameras,
  PTZ_COMMANDS,
  sendPtz,
} from "./service/frigate";

const cameraName = z.string().regex(/^[\w-]+$/);
const unavailable = () => status(502, { error: "Frigate indisponível" });

/** Proxies a Frigate media/JSON response, keeping Range so <video> can seek. */
async function proxyFrigate(path: string, request: Request) {
  const range = request.headers.get("range");
  const res = await frigateFetch(path, {
    headers: range ? { range } : undefined,
    signal: request.signal,
    skipInstrumentation: true,
  }).catch(() => {
    throw unavailable();
  });
  if (res.status === 404) throw status(404, { error: "Não encontrado" });
  if (!res.ok || !res.body) throw unavailable();
  const headers = new Headers({ "cache-control": "no-store" });
  for (const key of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
  ]) {
    const value = res.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, headers });
}

export const frigateRoutes = new Elysia({
  prefix: "/api/frigate",
  detail: { tags: ["Frigate"] },
})
  .use(authz)
  .get(
    "/cameras",
    async (ctx): Promise<string[]> => {
      const user = currentUser(ctx);
      const cameras = await listEnabledCameras().catch(() => {
        throw status(502, { error: "Frigate indisponível" });
      });
      const readable = await readableResourceIds(user.id, "frigate_camera");
      return cameras.filter((name) => readable.has(name));
    },
    {
      detail: {
        summary: "List Cameras",
        description: "Lists the enabled Frigate cameras the user can read.",
      },
    },
  )
  .get(
    "/stats",
    async (ctx) => {
      const user = currentUser(ctx);
      const [stats, readable] = await Promise.all([
        frigateStats().catch(() => {
          throw unavailable();
        }),
        readableResourceIds(user.id, "frigate_camera"),
      ]);
      return {
        ...stats,
        cameras: Object.fromEntries(
          Object.entries(stats.cameras).filter(([name]) => readable.has(name)),
        ),
      };
    },
    {
      detail: {
        summary: "Frigate Stats",
        description:
          "Camera FPS (readable cameras only), detector speed, recordings disk and version.",
      },
    },
  )
  .get(
    "/cameras/:name/stream",
    async ({ params, request }) => {
      // go2rtc negotiates the codecs over MSE (transcoding G.711 audio itself).
      const src = params.name;
      const live = await frigateLiveStream(src, request.signal).catch(() => {
        throw status(502, { error: "Stream falhou" });
      });
      // Fragmented MP4 piped through untouched; the content-type carries the
      // codec string the <video> needs.
      return new Response(live.body, {
        headers: { "content-type": live.mime, "cache-control": "no-store" },
      });
    },
    {
      detail: {
        summary: "Camera Stream",
        description:
          "Proxies the go2rtc live MP4 stream, adding the Authentik bearer token.",
      },
      params: z.object({ name: z.string().regex(/^[\w-]+$/) }),
      query: z.object({ audio: z.string().optional() }),
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
  )
  .get(
    "/cameras/:name/state",
    async ({ params }) => {
      const [ptz, config] = await Promise.all([
        frigateFetch(`/api/${params.name}/ptz/info`).then(async (res) =>
          res.ok
            ? ((await res.json()) as { features: string[]; presets: string[] })
            : null,
        ),
        cameraLiveConfig(params.name),
      ]).catch(() => {
        throw unavailable();
      });
      const features = Object.fromEntries(
        Object.entries(CAMERA_FEATURES).map(([feature, key]) => [
          feature,
          config?.[key] === true,
        ]),
      );
      return { ptz, features };
    },
    {
      detail: {
        summary: "Camera State",
        description: "PTZ capabilities and live feature switches of a camera.",
      },
      params: z.object({ name: cameraName }),
    },
  )
  .get(
    "/cameras/:name/events",
    ({ params, query, request }) => {
      const search = new URLSearchParams({
        cameras: params.name,
        limit: String(query.limit),
      });
      if (query.label) search.set("labels", query.label);
      if (query.before) search.set("before", String(query.before));
      if (query.after) search.set("after", String(query.after));
      return proxyFrigate(`/api/events?${search}`, request);
    },
    {
      detail: {
        summary: "Camera Events",
        description: "Frigate events of a camera, newest first.",
      },
      params: z.object({ name: cameraName }),
      query: z.object({
        label: z.string().regex(/^[\w,-]+$/).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
        before: z.coerce.number().optional(),
        after: z.coerce.number().optional(),
      }),
    },
  )
  .get(
    "/cameras/:name/events/:id/:asset",
    async ({ params, request }) => {
      // Frigate would serve any event id; keep it inside the camera granted.
      const event = await frigateFetch(`/api/events/${params.id}`)
        .then(async (res) =>
          res.ok ? ((await res.json()) as { camera: string }) : null,
        )
        .catch(() => {
          throw unavailable();
        });
      if (event?.camera !== params.name) {
        throw status(404, { error: "Não encontrado" });
      }
      return proxyFrigate(`/api/events/${params.id}/${params.asset}`, request);
    },
    {
      detail: {
        summary: "Camera Event Media",
        description: "Thumbnail, snapshot or clip of one of the camera's events.",
      },
      params: z.object({
        name: cameraName,
        id: z.string().regex(/^[\w.-]+$/),
        asset: z.enum(["thumbnail.jpg", "snapshot.jpg", "clip.mp4"]),
      }),
    },
  )
  .get(
    "/cameras/:name/recordings/summary",
    ({ params, query, request }) =>
      proxyFrigate(
        `/api/${params.name}/recordings/summary?${new URLSearchParams(query)}`,
        request,
      ),
    {
      detail: {
        summary: "Camera Recordings Summary",
        description:
          "Per day and hour recording and motion summary, bucketed in the given timezone (Frigate defaults to UTC).",
      },
      params: z.object({ name: cameraName }),
      query: z.object({ timezone: z.string().regex(/^[\w/+-]+$/).optional() }),
    },
  )
  .get(
    "/cameras/:name/clip.mp4",
    ({ params, query, request }) =>
      proxyFrigate(
        `/api/${params.name}/start/${query.start}/end/${query.end}/clip.mp4`,
        request,
      ),
    {
      detail: {
        summary: "Camera Recording Clip",
        description: "MP4 of the recording between two unix timestamps.",
      },
      params: z.object({ name: cameraName }),
      query: z.object({
        start: z.coerce.number().int(),
        end: z.coerce.number().int(),
      }),
    },
  )
  .get(
    "/cameras/:name/latest.jpg",
    ({ params, request }) =>
      proxyFrigate(`/api/${params.name}/latest.jpg`, request),
    {
      detail: {
        summary: "Camera Latest Frame",
        description: "The camera's latest frame as a JPEG.",
      },
      params: z.object({ name: cameraName }),
    },
  )
  .post(
    "/cameras/:name/ptz",
    async ({ params, body }) => {
      await sendPtz(params.name, body.command).catch(() => {
        throw unavailable();
      });
      return { ok: true };
    },
    {
      detail: {
        summary: "Camera PTZ",
        description: "Moves, zooms or stops the camera, or goes to a preset.",
      },
      params: z.object({ name: cameraName }),
      body: z.object({
        command: z.union([
          z.enum(PTZ_COMMANDS),
          z.string().regex(/^preset_[\w-]+$/),
        ]),
      }),
    },
  )
  .put(
    "/cameras/:name/features/:feature",
    async ({ params, body }) => {
      const res = await frigateFetch(
        `/api/camera/${params.name}/set/${params.feature}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: body.value ? "ON" : "OFF" }),
        },
      ).catch(() => {
        throw unavailable();
      });
      if (!res.ok) throw unavailable();
      return { ok: true };
    },
    {
      detail: {
        summary: "Camera Feature",
        description: "Turns a camera feature (detect, audio...) on or off.",
      },
      params: z.object({
        name: cameraName,
        feature: z.enum(
          Object.keys(CAMERA_FEATURES) as [
            keyof typeof CAMERA_FEATURES,
            ...(keyof typeof CAMERA_FEATURES)[],
          ],
        ),
      }),
      body: z.object({ value: z.boolean() }),
    },
  );
