import { getTPLinkClient } from "./common";

type ClientApi = Awaited<ReturnType<typeof getTPLinkClient>>["api"];

export type Device = NonNullable<Awaited<ReturnType<ClientApi["devices"]["get"]>>["data"]>[number];

type DeviceApi = ReturnType<ClientApi["devices"]>;

export type DeviceHistoryEntry = NonNullable<
    Awaited<ReturnType<DeviceApi["history"]["get"]>>["data"]
>[number];

export type LatestCheck = NonNullable<
    Awaited<ReturnType<ClientApi["checks"]["latest"]["get"]>>["data"]
>;

export type LatestRouterStatus = NonNullable<
    Awaited<ReturnType<ClientApi["settings"]["latest-router-status"]["get"]>>["data"]
>;
