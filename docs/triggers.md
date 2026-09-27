# Triggers

The old repo had a generic `Trigger` abstraction (`id`, `type`, `register()`, `test()`) with six factory functions — `onHttp`, `onMqtt`, `onRedis`, `onPostgres`, `onEmail`, `onCron` — registered through a central `registerSettings({ triggers: [...] })` call. **None of that survived the rewrite.** This repo has exactly two ways code starts running, plus one always-on connection, wired directly instead of through a shared registry:

## 1. HTTP routes

A module's `index.ts` is a plain Elysia instance, mounted directly in `server/index.ts`:

```ts
// server/modules/<domain>/index.ts
export const xRoutes = new Elysia({ prefix: "/api/<domain>", detail: { tags: ["X"] } })
    .get("/thing", async () => { ... }, { detail: { summary: "...", description: "..." } });

// server/index.ts
.use(xRoutes)
```

No factory function, no registration array — the `elysiaOtel` plugin wrapping the whole app instruments every mounted route automatically (see [`instrumentation.md`](./instrumentation.md)).

## 2. Cron jobs

`server/cron.ts` is the single place every scheduled job is registered, using Bun's native `Bun.cron` directly:

```ts
// server/cron.ts, inside registerCrons()
Bun.cron("*/2 * * * *", tracedCronJob("trainStatus.check", checkTrainLinesStatus));
```

`tracedCronJob` opens a span and swallows the job's own errors so one failing job can't take the process down or block the next `Bun.cron(...)` line from registering. `registerCrons()` itself no-ops unless `NODE_ENV=production` or `ENABLE_CRONS=true` — see [`configuration.md`](./configuration.md).

There is no `test()`/`--test=<id>` equivalent — to exercise a job once, call its exported function directly (e.g. from a scratch script or the REPL) or set `ENABLE_CRONS=true` and wait for its schedule.

## 3. Tuya Pulsar (the one always-on connection)

`startTuyaPulsar()` (`server/modules/tuya/service/pulsar/index.ts`), called once from `server/index.ts`, opens a websocket to Tuya's Pulsar message queue for the lifetime of the process and pushes every incoming device/sensor event through `handlePulsarMessage`. This is not a generic "trigger type" — it's the one module that genuinely needs a persistent connection, so it's started directly rather than through any shared abstraction.

### Reacting to a device/sensor change from other code

The old repo's `onTuyaSensorChange`/`onTuyaDeviceChange` trigger factories are gone. In their place, `server/modules/tuya/events.ts` exposes a plain in-process `EventEmitter`-based bus:

```ts
import { tuyaEvents } from "@server/modules/tuya/events";

const unsubscribe = tuyaEvents.onDeviceChange((event) => {
  // event: { device, previous, current, changed, at }
});

tuyaEvents.onSensorChange((event) => {
  // event: { sensor, code, value, previousValue, at }
});
```

Both fire from `StateService.saveStateIfChanged` and the Pulsar handler's sensor-report path respectively — i.e. for changes coming from Tuya's cloud, however they originated (the Smart Life app, a physical switch, this app's own dashboard). There's no separate "automations" folder yet; a script watching this bus would live as a new listener registered near where `tuyaEvents` is imported, not as a registered trigger.

## What's gone, and why

| Old trigger type | Status | Replaced by |
|---|---|---|
| MQTT | Removed | Nothing needed it after the Tuya rewrite dropped the local LAN protocol — see [`tuya.md`](./tuya.md) |
| Redis Pub/Sub | Removed | Not used by any current module (Redis is still used, just for caching — `server/shared/cache.ts`) |
| PostgreSQL polling | Removed | Scheduled jobs (`Bun.cron`) read/write the DB directly when they run, instead of a separate poller |
| Email (IMAP) | Removed | Gmail integration goes through the Gmail API (`server/modules/google/service/gmail.ts`), not IMAP IDLE |
| HTTP | Kept, simplified | Plain Elysia instances, no `TypedElysia()` wrapper needed |
| Cron | Kept, simplified | `Bun.cron` directly, wrapped once by `tracedCronJob` |
