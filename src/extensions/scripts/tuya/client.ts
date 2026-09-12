import { treaty } from "@elysia/eden";
import type { tuyaElysiaClient } from "./routes";

export function getTuyaEdenClient() {
    return treaty<typeof tuyaElysiaClient>("", {
        keepDomain: true,
    });
}
