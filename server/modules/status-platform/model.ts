import { z } from "zod";

export const PLATFORMS = [
  "incident",
  "instatus",
  "atlassian",
  "generic",
  "wake",
  "shopify",
  "cloudflare",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const platformBody = z.object({
  name: z.string().meta({
    title: "Name",
    description: "Display name for the platform",
    example: "Shopify",
  }),
  url: z.string().meta({
    title: "URL",
    description: "Status page or endpoint URL to check",
    example: "https://www.shopifystatus.com",
  }),
  type: z.enum(PLATFORMS).meta({
    title: "Type",
    description: "Which fetcher to use when checking this platform",
    example: "shopify",
  }),
});
export type PlatformBody = z.infer<typeof platformBody>;

export const historyQuery = z.object({
  before: z.string().optional().meta({
    title: "Before",
    description: "ISO timestamp cursor; returns history entries older than this",
    example: "2026-09-26T12:00:00.000Z",
  }),
});
