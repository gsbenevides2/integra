import type { Platform } from "../../model";
import { fetchFromAtlassianStatuspage } from "./atlassian";
import { fetchFromCloudflareStatus } from "./cloudflare";
import { fetchFromGenericHttp } from "./generic";
import { fetchFromIncidentIoStatus } from "./incident";
import { fetchFromInstatusStatuspage } from "./instatus";
import { fetchFromShopifyStatus } from "./shopify";
import type { StatusFetcher } from "./types";
import { fetchFromWakeStatuspage } from "./wake";

export type { StatusFetcher, StatusReturn } from "./types";

export const Fetchers: Record<Platform, StatusFetcher> = {
  incident: fetchFromIncidentIoStatus,
  atlassian: fetchFromAtlassianStatuspage,
  instatus: fetchFromInstatusStatuspage,
  generic: fetchFromGenericHttp,
  wake: fetchFromWakeStatuspage,
  shopify: fetchFromShopifyStatus,
  cloudflare: fetchFromCloudflareStatus,
};
