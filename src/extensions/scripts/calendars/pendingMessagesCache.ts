import { CacheClient } from "utils/cacheClient";
import type { PendingMessage } from "./types";

const CACHE_KEY = "calendars_pending_messages";

export async function getPendingMessages(): Promise<PendingMessage[]> {
    const raw = await CacheClient.get(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingMessage[];
}

export async function setPendingMessages(messages: PendingMessage[]): Promise<void> {
    await CacheClient.set(CACHE_KEY, JSON.stringify(messages));
}
