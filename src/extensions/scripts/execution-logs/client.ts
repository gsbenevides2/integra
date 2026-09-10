import { treaty } from "@elysia/eden";
import type { executionLogsElysiaClient } from "./routes";

export function getExecutionLogsEdenClient() {
    return treaty<typeof executionLogsElysiaClient>("", {
        keepDomain: true,
    });
}
