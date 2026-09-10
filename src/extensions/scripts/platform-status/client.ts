import { treaty } from "@elysia/eden";
import type { platformStatusElysiaClient } from "./routes";

export function getPlatformStatusEdenClient() {
    return treaty<typeof platformStatusElysiaClient>("", {
        keepDomain: true,
    });
}
