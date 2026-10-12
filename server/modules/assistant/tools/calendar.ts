import { CalendarService } from "@server/modules/google/service/calendar";

import { z } from "zod";

import { guardedTool, type ToolContext } from "./guard";

/** São Paulo has had no DST since 2019, so its offset is fixed. */
const SAO_PAULO_OFFSET = "-03:00";
const DAY_MS = 24 * 60 * 60 * 1000;

/** The YYYY-MM-DD of `date` in São Paulo. */
export function saoPauloDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function resolveDay(day: string, now = new Date()): string {
  if (day === "hoje") return saoPauloDate(now);
  if (day === "amanha") return saoPauloDate(new Date(now.getTime() + DAY_MS));
  return day;
}

/** Keeps the first item for each key, in order. */
function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function calendarTools(ctx: ToolContext) {
  return [
    guardedTool(ctx, {
      name: "agenda",
      description:
        "Compromissos da agenda do Google (todas as contas conectadas) em um dia.",
      routeKeys: ["GET /api/google/accounts"],
      inputSchema: z.object({
        dia: z
          .union([
            z.enum(["hoje", "amanha"]),
            z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          ])
          .describe('"hoje", "amanha" ou uma data YYYY-MM-DD'),
      }),
      execute: async ({ dia }) => {
        const date = resolveDay(dia);
        const start = `${date}T00:00:00${SAO_PAULO_OFFSET}`;
        const end = `${date}T23:59:59${SAO_PAULO_OFFSET}`;
        // The same shared calendar shows up under every account that sees it.
        const calendars = uniqueBy(
          await CalendarService.listCalendars(),
          (c) => c.calendarId,
        );
        const events = (
          await Promise.all(
            calendars.map((c) => CalendarService.listEvents(c, start, end)),
          )
        ).flat();
        return {
          data: date,
          eventos: uniqueBy(events, (e) => e.id)
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .map((e) => ({
              titulo: e.summary,
              inicio: e.startDate,
              fim: e.endDate,
              local: e.location || undefined,
            })),
        };
      },
      summarize: (_input, output) =>
        `Consultou a agenda (${output.eventos.length} eventos)`,
    }),
  ];
}
