import { getClient } from "./common";

type ClientApi = Awaited<ReturnType<typeof getClient>>["api"];

export type SchedulledRequest = NonNullable<
    Awaited<ReturnType<ClientApi["schedulled_requests"]["get"]>>["data"]
>[number];

export type AddSchedulledRequest = Parameters<ClientApi["schedulled_requests"]["post"]>[0][number];
