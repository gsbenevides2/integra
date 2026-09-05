import { getTPLinkClient } from "./common";

export async function sync(traceId: string): Promise<void> {
    const client = await getTPLinkClient(traceId);
    await client.api.router.sync.post();
}
