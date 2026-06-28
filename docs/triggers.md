# Triggers

Triggers are the core abstraction in Integra. A **Trigger** is an object with:
- `id: string` — unique identifier
- `register(): Promise<void>` — called during startup to wire the trigger to its service

## Creating a Trigger

Each trigger type has a factory function:

```ts
import onHttp from "triggers/http";
import { TypedElysia } from "triggers/http/types";

const trigger = onHttp(
    { id: "my:httpTrigger" },
    TypedElysia().get("/hello", () => "Hello!"),
);
```

## Available Trigger Types

### HTTP (Elysia)

File: `src/triggers/http/index.ts`

Creates an Elysia route. Supports full Elysia API (params, query, body validation via Zod, etc.).

```ts
onHttp({ id: "my:endpoint" }, elysiaApp);
```

Triggers are registered into a global Elysia server that starts on configurable `PORT` (default 3000).

### MQTT

File: `src/triggers/mqtt/index.ts`

Subscribes to a topic on an MQTT broker.

```ts
onMqtt({ id: "my:mqtt", broker: "default", topic: "home/temp" }, async (message, topic, traceId) => {
    console.log(message.toString());
});
```

- `qos`: 0, 1, or 2 (default 0)
- Instances defined in `src/triggers/mqtt/brokers.ts`

### Home Assistant (WebSocket)

File: `src/triggers/hass/index.ts`

Subscribes to Home Assistant events via WebSocket.

```ts
onHassEvent(
    { id: "my:ha", instance: "default", eventType: "state_changed", entityId: "light.living_room" },
    async (event, traceId) => { ... },
);
```

- `eventType`: defaults to `"state_changed"`
- `entityId`: optional filter
- Instances defined in `src/triggers/hass/instances.ts`

### Redis (Pub/Sub)

File: `src/triggers/redis/index.ts`

Subscribes to a Redis channel.

```ts
onRedis({ id: "my:redis", instance: "default", channel: "notifications" }, async (message, channel, traceId) => { ... });
```

- Uses Bun's built-in `RedisClient`
- Instances defined in `src/triggers/redis/instances.ts`

### PostgreSQL (Polling)

File: `src/triggers/postgres/index.ts`

Polls a PostgreSQL database at a fixed interval.

```ts
onPostgres(
    { id: "my:pg", instance: "default", query: "SELECT * FROM events WHERE processed = false", intervalMs: 5000 },
    async (rows, traceId) => { ... },
);
```

- `intervalMs`: polling interval in milliseconds
- Uses Bun's built-in `SQL` client
- Instances defined in `src/triggers/postgres/instances.ts`

### Email (IMAP)

File: `src/triggers/email/index.ts`

Listens for new emails via IMAP IDLE.

```ts
onEmail(
    { id: "my:email", account: "default", mailbox: "INBOX", searchCriteria: ["UNSEEN"], markSeen: true },
    async (email, traceId) => { ... },
);
```

- Uses `imap` and `mailparser` packages
- Accounts defined in `src/triggers/email/accounts.ts`

### Cron

File: `src/triggers/cron/index.ts`

Runs on a schedule using Bun's built-in cron.

```ts
onCron(
    { id: "my:cron", cron: "*/5 * * * *" },
    async (cronJob, traceId) => { ... },
);
```

## Trigger Registry (CLI)

`src/triggers/index.ts` handles registration and CLI arguments:

| Flag | Description |
|------|-------------|
| `--only-run=id` | Only register triggers matching this id (repeatable) |
| `--debug` | Enable debug logging |

```bash
bun run src/index.ts --only-run=authentik:loginFailed --debug
```