# Architecture

Integra is a single Bun process: one Elysia HTTP server, a set of `Bun.cron` scheduled jobs, and one always-on websocket connection (Tuya Pulsar). There is no separate trigger-registry abstraction, no message broker client, no polling loop against the database — each module wires itself into exactly the mechanism it needs.

## High-Level Flow

```text
External callers / browser
   │
   ▼
┌───────────────────────────────────────────┐
│  Bun.serve (server/index.ts)               │
│                                             │
│  elysiaOtel → openapi → static(public/) →  │
│  one Elysia instance per module, .use()'d  │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│  Module (server/modules/<domain>)          │
│                                             │
│  index.ts (routes) → service/*.ts          │
│  (business logic + DB access via Drizzle)  │
└───────────────┬─────────────────────────────┘
                │
   ┌────────────┼───────────────┐
   ▼            ▼               ▼
 Postgres    External API    Discord / SSH / etc.
 (Drizzle,   (fetch, auto-   (server/shared/*)
 own schema)  traced)

In parallel:
  Bun.cron (server/cron.ts) ──▶ tracedCronJob(name, job) ──▶ same module's jobs/*.ts
  Tuya Pulsar (websocket)   ──▶ handlePulsarMessage       ──▶ updates device/sensor state
```

Every hop in the request path — the HTTP request itself, any outgoing `fetch`, any DB query — opens its own OpenTelemetry span and exports it via OTLP. See [`instrumentation.md`](./instrumentation.md).

## Key Concepts

- **Module**: a self-contained feature (`server/modules/<domain>/`) — its own DB schema, service classes, routes, and optionally a dashboard. Nothing generic connects modules together; `server/index.ts` and `server/cron.ts` wire each one in explicitly.
- **Service**: a domain's logic as `static` methods on an `abstract class`. Routes and jobs call services; services are the only thing that touches the database or an external API for that domain.
- **Job**: a plain `async function` a module exports for `server/cron.ts` to schedule — it has no idea when or how often it runs.
- **Shared service** (`server/shared/*`): a service used by more than one module (SSH, Discord, Redis cache, Authentik login) — lives outside any single module so nothing has to import across module boundaries.

## Directory Structure

```text
server/
├── index.ts                 # Builds the app, mounts every module, starts Pulsar, registers crons
├── cron.ts                   # registerCrons() — every Bun.cron(...) call, one per line
├── openapi.ts                 # OpenAPI/Scalar docs metadata
├── db/                        # One pgSchema per module + the schema.ts barrel
├── instrumentation/            # OTEL wiring for HTTP, fetch, and DB
├── shared/                     # Cross-module services (ssh, discord, cache, authentik)
└── modules/
    ├── google/                # Account linking, Calendar reminders, Gmail watchers, payslips
    ├── tuya/                  # Cloud devices/sensors + Pulsar real-time push
    ├── tplink/                # Router device sync, DHCP/firewall reconciliation
    ├── server-metrics/         # SSH-collected system stats + Cloudflare speedtest
    ├── status-platform/        # Uptime checks against status pages
    ├── train-status/           # São Paulo train/metro line status
    ├── birthday/               # Cron-only Discord announcement
    └── authentik/               # Login-failed webhook → Discord

public/
├── index.tsx                 # App shell (Toast/Confirm/GlobalDrawer providers)
├── components/                # Shared UI primitives + GlobalDrawerContext (dashboard registry)
└── dashboards/<domain>/       # client.ts (Eden Treaty) + index.tsx + component/*
```

See [`overview.md`](./overview.md) for the per-module internal file convention and [`development.md`](./development.md) for how to add a new one.
