import { treaty } from "@elysia/eden";
import type { tpLinkCenterElysiaClient } from "./routes";

export function getTpLinkCenterEdenClient() {
    return treaty<typeof tpLinkCenterElysiaClient>("", {
        keepDomain: true,
    });
}
