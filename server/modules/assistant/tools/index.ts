import { calendarTools } from "./calendar";
import { cronTools } from "./crons";
import type { ToolContext } from "./guard";
import { imageTools } from "./images";
import { statusTools } from "./status";
import { tuyaTools } from "./tuya";

export type { ToolContext } from "./guard";

/** Every tool the assistant can call, bound to the user it acts for. */
export function buildTools(ctx: ToolContext) {
  return [
    ...tuyaTools(ctx),
    ...statusTools(ctx),
    ...calendarTools(ctx),
    ...cronTools(ctx),
    ...imageTools(ctx),
  ];
}
