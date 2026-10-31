import { authz } from "@server/shared/authz";

import Elysia from "elysia";

import { COMMUTE_LEGS, type LegStatus } from "./model";
import { fetchNextTrain } from "./service/motiva";

function etaMin(expectedArrivalTime: string) {
  if (!expectedArrivalTime) return undefined;
  return Math.max(0, Math.round((new Date(expectedArrivalTime).getTime() - Date.now()) / 60_000));
}

export const motivaTrilhosRoutes = new Elysia({
  prefix: "/api/motiva-trilhos",
  detail: {
    tags: ["MotivaTrilhos"],
  },
}).use(authz).get(
  "/",
  async () => ({
    legs: await Promise.all(
      COMMUTE_LEGS.map(async (leg): Promise<LegStatus> => {
        const entries = await fetchNextTrain(leg);
        const entry = entries.find((e) => e.direction === leg.direction);
        return {
          id: leg.id,
          label: leg.label,
          line: leg.line,
          trip: leg.trip,
          etaMin: entry ? etaMin(entry.expectedArrivalTime) : undefined,
        };
      }),
    ),
  }),
  {
    detail: {
      summary: "Commute Next Trains",
      description:
        "Next-train ETA for the fixed Luz↔Pinheiros↔Morumbi commute (lines 4-Amarela and 9-Esmeralda), both directions.",
    },
  },
);
