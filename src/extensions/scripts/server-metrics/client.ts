import { treaty } from "@elysia/eden";
import type { serverMetricsElysiaClient } from "./routes";

export function getServerMetricsEdenClient() {
    return treaty<typeof serverMetricsElysiaClient>("", {
        keepDomain: true,
    });
}
