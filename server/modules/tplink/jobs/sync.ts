import { syncSettings } from "../service/router";

export async function syncTpLinkData(): Promise<void> {
  await syncSettings();
}
