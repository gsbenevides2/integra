import { treaty } from "@elysia/eden";
import type { plataformStatusElysiaClient } from "./routes";

export function getPlataformStatusEdenClient() {
    return treaty<typeof plataformStatusElysiaClient>("", {
        keepDomain: true,
    });
}
