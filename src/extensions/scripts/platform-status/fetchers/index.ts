import type { Platform } from "utils/statusPlatform";
import { fetchFromAtlassianStatuspage } from "./atlassian";
import { fetchFromGenericHttp } from "./generic";
import { fetchFromIncidentIoStatus } from "./incident";
import { fetchFromInstatusStatuspage } from "./instatus";
import { fetchFromWakeStatuspage } from "./wake";
import type { StatusFetcher } from "./types";

export type { StatusReturn, StatusFetcher } from "./types";

export const Fetchers: Record<Platform, StatusFetcher> = {
    incident: fetchFromIncidentIoStatus,
    atlassian: fetchFromAtlassianStatuspage,
    instatus: fetchFromInstatusStatuspage,
    generic: fetchFromGenericHttp,
    wake: fetchFromWakeStatuspage,
};
