import type { Platform } from "@server/modules/status-platform/model";

/** Friendly, pt-BR names for the status-page providers supported by the fetchers. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  incident: "Incident.io",
  instatus: "Instatus",
  atlassian: "Atlassian Statuspage",
  generic: "Genérico (HTTP)",
  wake: "Wake",
  shopify: "Shopify",
  cloudflare: "Cloudflare",
};