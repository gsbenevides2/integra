import { authz } from "@server/shared/authz";

import Elysia from "elysia";
import { z } from "zod";

import { fetchAllLines } from "./service/emtu";
import { findNearbyStops } from "./service/eta";

export const nearbyBusRoutes = new Elysia({
  prefix: "/api/nearby-bus",
  detail: {
    tags: ["NearbyBus"],
  },
})
  .use(authz)
  .get(
    "/map-config",
    () => ({ apiKey: process.env.GOOGLE_MAPS_API_KEY || null }),
    {
      detail: {
        summary: "Map Config",
        description:
          "Google Maps JavaScript API key for the map (null when not configured). A browser key: restrict it by HTTP referrer in Google Cloud.",
      },
    },
  )
  .get(
    "/",
    async ({ query }) => ({
      stops: findNearbyStops(await fetchAllLines(), [query.lat, query.lng]),
    }),
    {
      query: z.object({
        lat: z.coerce.number().min(-90).max(90).meta({
          title: "Latitude",
          example: -23.54,
        }),
        lng: z.coerce.number().min(-180).max(180).meta({
          title: "Longitude",
          example: -46.31,
        }),
      }),
      detail: {
        summary: "Nearby Buses",
        description:
          "EMTU lines 381 and 215 stops within ~600 m of the position, with live or scheduled arrivals.",
      },
    },
  );
