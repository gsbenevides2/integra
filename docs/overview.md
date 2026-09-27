# Integra — Complete Overview

**Integra** is a personal home-automation and monitoring server built with **Bun** and **Elysia**. It talks to real hardware and external APIs (a Tuya smart-home account, a TP-Link router, Google accounts, SSH-reachable servers, status pages, train APIs, Discord, Authentik) and exposes a React dashboard over all of it. Every HTTP request, outgoing `fetch`, database query and cron run is traced end-to-end with OpenTelemetry.

It is a from-scratch rewrite of an older project (`integra`) that used a heavier custom trigger/tracing framework (MQTT, Redis pub/sub, PostgreSQL polling, IMAP email triggers, a bespoke Postgres-backed tracer). None of that framework survived the rewrite — see [`instrumentation.md`](./instrumentation.md) and [`triggers.md`](./triggers.md) for what replaced it.

## Project Summary

| Property | Value |
|----------|-------|
| **Name** | `@gsbenevides2/integra` (`displayName`: Integra) |
| **Runtime** | Bun |
| **HTTP Framework** | Elysia |
| **Database** | PostgreSQL (Drizzle ORM, schema-push, no migrations) |
| **Validation** | Zod v4 |
| **Frontend** | React 19 + Tailwind CSS 4, served as one SPA |
| **Tracing** | OpenTelemetry (OTLP), exported to an external collector |

## Directory Structure

```text
server/
├── index.ts                     # Entry point: builds the Elysia app, mounts every module,
│                                 # starts Tuya Pulsar, calls registerCrons()
├── cron.ts                      # Every scheduled job, registered in one place via Bun.cron
├── openapi.ts                   # OpenAPI/Scalar docs config (title/description from package.json)
├── safeEnvGet.ts                # Throws at call time if an env var is missing
├── instrumentation/
│   ├── instrumentHttpServer.ts  # elysiaOtel plugin + frontend trace proxy (/v1/traces)
│   ├── instrumentFetch.ts       # Monkey-patches global fetch to trace every outgoing call
│   └── instrumentDb.ts          # Wraps Bun's SQL client to trace every query
├── shared/                      # Cross-module services (not tied to one domain)
│   ├── ssh.ts                   # runSshCommand() via node-ssh
│   ├── discord.ts               # sendDiscordMessage()
│   ├── cache.ts                 # redisGet/redisSet via Bun.redis
│   └── authentik.ts             # loginInAuthentik() — Authentik OAuth client-credentials login
├── db/
│   ├── index.ts                 # drizzle() instance over Bun's SQL client
│   ├── schema.ts                # Barrel: `export * from "./<domain>"` per module
│   ├── drizzle.config.ts        # drizzle-kit config (schema-push target)
│   └── <domain>.ts              # One pgSchema(<domain>) per module (google, tuya, tplink, ...)
├── modules/
│   ├── google/                  # Google account linking, Calendar reminders, Gmail watchers
│   ├── tuya/                    # Tuya cloud devices/sensors, real-time via Pulsar
│   ├── tplink/                  # TP-Link router device sync, DHCP/firewall reconciliation
│   ├── server-metrics/          # SSH-collected system stats + Cloudflare speedtest
│   ├── status-platform/         # Uptime checks against status pages (Atlassian, Instatus, ...)
│   ├── train-status/            # São Paulo train/metro line status scrapers
│   ├── birthday/                # Daily Discord birthday announcement (cron-only, no routes/UI)
│   └── authentik/                # Authentik login-failed webhook → Discord
└── utils/getProjectInfo.ts      # Re-exports name/description/version/... from package.json

public/
├── index.tsx                    # App entry: Toast/Confirm/GlobalDrawer providers
├── instrumentFrontend.ts         # OpenObserve RUM + logs, OTEL web instrumentation
├── components/                   # Shared UI primitives (Button, Modal, Drawer, Select, ...)
│   └── GlobalDrawerContext/      # DASHBOARD_LIST — the one place a dashboard gets registered
└── dashboards/<domain>/         # One folder per module with a UI: client.ts, index.tsx, component/*
```

Every module under `server/modules/<domain>/` follows the same internal shape:

```text
<domain>/
├── model.ts        # Zod schemas + shared types/consts — no logic
├── service/*.ts     # `export abstract class XService { static async foo() {...} }`
├── jobs/*.ts        # Plain async functions, wired up only from server/cron.ts
└── index.ts         # Elysia instance, prefix "/api/<domain>", talks only to services
```

See [`development.md`](./development.md) for the full checklist to follow when adding a new one.

## Execution Flow

```text
Browser / external caller
   │
   ▼
Bun.serve (server/index.ts)
   │
   ├─ elysiaOtel plugin — opens a span per request, records headers/body, exports via OTLP
   ├─ static plugin — serves public/ (the SPA, its assets, the service worker)
   └─ one Elysia instance per module, mounted with .use()
        │
        ├─ route calls into a Service (server/modules/<domain>/service/*)
        │    ├─ every outgoing fetch() is auto-traced (instrumentFetch)
        │    └─ every DB query is auto-traced (instrumentDb)
        └─ response returned; a span attribute records it too

Independently, on a timer:
   Bun.cron (server/cron.ts) → tracedCronJob(name, fn) → same module's jobs/*.ts
   (disabled by default outside production — see "Cron safety" below)

Independently, always-on:
   Tuya Pulsar websocket (server/modules/tuya/service/pulsar) → handlePulsarMessage
   → updates device/sensor state in real time, no polling involved
```

## Key Concepts

### Module
A self-contained feature under `server/modules/<domain>/`: its own DB tables (`server/db/<domain>.ts`), its own Zod schemas, its own service classes, its own Elysia routes, and — if it needs one — its own dashboard under `public/dashboards/<domain>/`. There is no shared "trigger registry" gluing modules together; each one is mounted or scheduled explicitly.

### Service
A domain's business logic, as `static` methods on an `abstract class` (e.g. `DeviceService`, `TrainStatusService`). Routes call services; services talk to the DB and to external APIs. Never the other way around.

### Job
A plain exported `async function` under a module's `jobs/` folder, with zero self-scheduling inside it. `server/cron.ts` is the only place that decides when a job runs.

### Cron safety
`registerCrons()` (`server/cron.ts`) no-ops unless `NODE_ENV=production` or `ENABLE_CRONS=true` is set, so running `bun run dev` locally never hits a real router, SSH box, Discord channel or external API on a schedule. Set `ENABLE_CRONS=true` to test one deliberately.

### Instrumentation
Everything is traced with OpenTelemetry, not a custom tracer — see [`instrumentation.md`](./instrumentation.md).

## CLI / Runtime Flags

There is no custom CLI argument parser (no `--only-run`, `--debug`, `--disableCrons` like the old repo). Behavior is controlled entirely through environment variables:

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `production` enables crons and disables Bun's dev/HMR mode |
| `ENABLE_CRONS` | `true` runs crons even when `NODE_ENV !== "production"` |

## Development Commands

| Command | Action |
|---------|--------|
| `bun run dev` | Start with `--watch` (HMR); crons disabled unless `ENABLE_CRONS=true` |
| `bun run lint` | ESLint check |
| `bun run lint:fix` | ESLint fix |
| `bun run db:sync` | Push Drizzle schema to PostgreSQL (`drizzle-kit push`, no migration files) |
| `bun run db:studio` | Open Drizzle Studio |

## Conventions

- **Imports**: path aliases `@server/*` and `@public/*` (see `tsconfig.json`), no bare `baseUrl: "src"` specifiers like the old repo.
- **HTTP routes**: a plain `new Elysia({ prefix, detail: { tags } })` — no `TypedElysia()` wrapper needed; OTEL instrumentation is automatic for every mounted route.
- **Validation**: Zod v4, schemas live in each module's `model.ts` with `.meta({ title, description, example })` so they double as OpenAPI documentation.
- **UI copy**: Portuguese (pt-BR); code identifiers: English.
- **Environment**: `safeEnvGet()` throws when called if the variable is missing (fail-fast, not fail-at-import).

## Database Schema

Every module owns its own Postgres schema (namespace), not shared tables. See each module's `server/db/<domain>.ts` for the exact tables — there is no generic "runs"/"run_events" tracing schema anymore (that lived in the old repo; tracing now goes straight to an external OTEL collector, not this app's own database).

## Security & Secrets

- `.env.local` is gitignored; see [`configuration.md`](./configuration.md) for the full variable reference.
- `safeEnvGet()` throws the first time a missing variable is actually read.
- The TP-Link module encrypts the router's admin password at rest (`ROUTER_PASSWORD_SECRET`) — see [`configuration.md`](./configuration.md).
