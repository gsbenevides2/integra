# Shared Utilities

The old repo's generic `src/utils/` grab-bag is now split by whether something is domain-specific (lives inside its module's own `service/`) or genuinely cross-module — the latter lives in `server/shared/`.

## `safeEnvGet(keyName: string): string` — `server/safeEnvGet.ts`

Reads an environment variable, throwing `Missing enviroment variable: <key>` if unset. Throws the moment it's called, not at module import time.

```ts
const url = safeEnvGet("MY_VAR"); // throws if not set
```

## `server/shared/` — cross-module services

### `runSshCommand(command, attributes?)` — `ssh.ts`

Runs a command over SSH (`node-ssh`), wrapped in an OpenTelemetry span. Reads `SSH_DEFAULT_HOST`/`PORT`/`USERNAME`/`PRIVATE_KEY`. Used by `server-metrics`.

```ts
const { stdout, stderr } = await runSshCommand("cat /proc/loadavg");
```

### `sendDiscordMessage(content: string): Promise<void>` — `discord.ts`

Posts a message to a Discord channel via the REST API (v10), authenticated with a bot token (`DISCORD_DEFAULT_PUBLIC_KEY` — the name is misleading, it's a bot token). The channel ID is hardcoded. Used by `authentik` and `birthday`.

### `redisGet(key)` / `redisSet(key, value)` — `cache.ts`

Thin, span-wrapped calls onto Bun's built-in `Bun.redis` client. Used by `google` (calendar/support-ticket dedup) and `authentik.ts`'s login cache below.

### `loginInAuthentik(clientId: string): Promise<{ access_token: string }>` — `authentik.ts`

Client-credentials OAuth login against Authentik, for calling other internal services that sit behind it. Caches the returned JWT in Redis (via `cache.ts`) until it's near its own expiry — decoded by hand (base64url-decoding the JWT payload) rather than pulling in a JWT library for that one field. Reads `AUTHENTIK_URL`/`USERNAME`/`PASSWORD`. Used by `birthday` to call its MCP microservice.

## What moved elsewhere

- Google API helpers (`accounts`, `calendar`, `gmail`, `openrouter`, `s3`) live in `server/modules/google/service/*` — they're only used by that module.
- Everything Tuya-specific (colour conversion, protocol quirks) lives in `server/modules/tuya/*` — nothing generic needed it elsewhere.
- There's no generic "instrumentable fetch" helper to import — see [`instrumentation.md`](./instrumentation.md), plain `fetch()` is already traced.
