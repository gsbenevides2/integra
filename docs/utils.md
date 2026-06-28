# Utilities

## `safeEnvGet(keyName: string): string`

File: `src/utils/safeEnvGet.ts`

Safely reads an environment variable. Throws if the variable is missing.

```ts
const url = safeEnvGet("MY_VAR"); // throws if not set
```

## `sendDiscordMessage(message: string, traceId: string)`

File: `src/utils/discord/sendMessage.ts`

Sends a message to a Discord channel using the Discord REST API (v10).

- Reads `DISCORD_DEFAULT_PUBLIC_KEY` from env (used as Bot token)
- Posts to channel ID `1444824842225582252`
- Uses `instumentableFetch` to log the HTTP call

```ts
await sendDiscordMessage("Hello from Integra!", traceId);
```