import { z } from "zod";

export const deviceBody = z.object({
  name: z.string().meta({ title: "Name", example: "Living room AP" }),
  brand: z.string().meta({ title: "Brand", example: "TP-Link" }),
  type: z.enum(["router", "client"]).meta({ title: "Type" }),
  isController: z.boolean().optional().meta({
    title: "Is controller",
    description: "Only one router may be the controller at a time.",
  }),
  routerPassword: z.string().nullable().optional().meta({
    title: "Router admin password",
    description: "Router devices only. Stored encrypted at rest.",
  }),
});

export const interfaceBody = z.object({
  name: z.string().meta({ title: "Name", example: "Wi-Fi" }),
  mac: z.string().meta({ title: "MAC address", example: "AA:BB:CC:DD:EE:FF" }),
  ip: z.string().meta({ title: "IP address", example: "192.168.0.10" }),
  reservedIp: z.boolean().optional().meta({ title: "Reserve this IP via DHCP" }),
  allowList: z.boolean().optional().meta({ title: "Allow through the firewall" }),
});

export const deviceHistoryQuery = z.object({
  from: z.string().meta({ title: "From (epoch ms)" }),
  to: z.string().meta({ title: "To (epoch ms)" }),
});

export const routerStatusHistoryQuery = z.object({
  before: z.string().optional().meta({ title: "Cursor (ISO date)" }),
});
