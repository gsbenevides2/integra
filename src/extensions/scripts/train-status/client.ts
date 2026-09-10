import { treaty } from "@elysia/eden";
import type { trainStatusElysiaClient } from "./routes";

export function getTrainStatusEdenClient() {
    return treaty<typeof trainStatusElysiaClient>("", {
        keepDomain: true,
    });
}
