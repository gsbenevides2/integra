import { treaty } from "@elysia/eden";
import type { googleAccountsElysiaClient } from "./routes";

export function getGoogleAccountsEdenClient() {
    return treaty<typeof googleAccountsElysiaClient>("", {
        keepDomain: true,
    });
}
