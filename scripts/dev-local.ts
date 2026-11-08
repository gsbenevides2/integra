/**
 * Preload for `bun run dev:local` (see package.json): points every
 * `*.infra.gui.dev.br` request at the LAN reverse proxy. The logic lives in
 * ./devLocal.ts so it can be tested without patching the test process.
 *
 * `DEV_LOCAL_IP` overrides the target address.
 */

import { installDevLocal, LOCAL_DOMAIN, LOCAL_IP } from "./devLocal";

const { proxyUrl } = installDevLocal({
  ip: process.env.DEV_LOCAL_IP || LOCAL_IP,
});

console.log(`[dev-local] *.${LOCAL_DOMAIN} → ${proxyUrl}`);
