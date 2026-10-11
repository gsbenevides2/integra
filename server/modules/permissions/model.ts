import { z } from "zod";

export const routeGrantBody = z.object({
  routeKey: z.string().min(1).meta({
    title: "Route Key",
    description: 'HTTP method plus route template, e.g. "GET /api/tuya/devices".',
    example: "GET /api/tuya/devices",
  }),
});

export const resourceGrantBody = z.object({
  resourceType: z
    .enum([
      "tuya_device",
      "tuya_sensor",
      "tuya_preset",
      "frigate_camera",
      "cron_job",
    ])
    .meta({ title: "Resource Type" }),
  resourceId: z.string().min(1).meta({
    title: "Resource ID",
    description:
      "Tuya UUID, Frigate camera name or jobRegistry cron name.",
  }),
  action: z
    .enum(["read", "write", "apply", "execute"])
    .meta({ title: "Action" }),
});
