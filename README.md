# Integra

Personal home-automation and monitoring server built with **Bun** and **Elysia**. Integrates a Tuya smart-home account, a TP-Link router, Google accounts, an SSH-reachable server, status pages, São Paulo train/metro lines, and Discord/Authentik notifications — with a React dashboard and end-to-end OpenTelemetry tracing.

## Features

- **Tuya smart home** — lamps, switches, and sensors, updated in real time via Tuya's Pulsar push connection (no polling)
- **TP-Link router** — device inventory, DHCP/firewall reconciliation, connection history
- **Google accounts** — Calendar reminders, Gmail-based support-ticket and payslip watchers
- **Monitoring** — SSH-collected server stats + Cloudflare speedtest, status-page uptime checks, train/metro line status
- **Notifications** — Discord messages for an Authentik login-failed webhook and a daily birthday announcement
- **Full OpenTelemetry tracing** — every HTTP request, outgoing `fetch`, DB query and cron run, backend and frontend
- **React dashboard** — one screen per integration, reachable from a single drawer menu
- **Zod validation** end to end, documented automatically via OpenAPI/Scalar

## Quick Start

```bash
# Install
bun install

# Configure
cp .env .env.local
# Edit .env.local — see docs/configuration.md

# Run (development — cron jobs disabled by default)
bun run dev

# Run (production — cron jobs enabled)
NODE_ENV=production bun run server/index.ts
```

Open http://localhost:3000/ to see the dashboard, or http://localhost:3000/openapi for the API docs.

## Documentation

See the [`docs/`](./docs/) folder for detailed documentation:

- **[Overview](./docs/overview.md)** — project structure and concepts
- **[Architecture](./docs/architecture.md)** — system design and data flow
- **[Modules](./docs/scripts.md)** — the module convention, and how to add a new one
- **[Triggers](./docs/triggers.md)** — HTTP routes, cron jobs, Tuya Pulsar
- **[Instrumentation](./docs/instrumentation.md)** — OpenTelemetry tracing, backend and frontend
- **[Configuration](./docs/configuration.md)** — environment variable reference
- **[Environment](./docs/environment.md)** — setup and code quality tools
- **[Development](./docs/development.md)** — the checklist for adding or changing a feature
- **[Tuya](./docs/tuya.md)** — the Tuya integration in depth
- **[Shared Utilities](./docs/utils.md)** — cross-module helpers

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start with file watching (HMR); cron jobs disabled unless `ENABLE_CRONS=true` |
| `bun run lint` | Lint with ESLint |
| `bun run lint:fix` | Lint and auto-fix |
| `bun run db:sync` | Push the Drizzle schema to PostgreSQL (no migration files) |
| `bun run db:studio` | Open Drizzle Studio |

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **HTTP**: [Elysia](https://elysiajs.com)
- **Validation**: [Zod](https://zod.dev) v4
- **Database**: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team), Redis (Bun's built-in client)
- **UI**: [React](https://react.dev) 19 + [Tailwind CSS](https://tailwindcss.com) 4
- **Tracing**: [OpenTelemetry](https://opentelemetry.io) (OTLP) + OpenObserve RUM/logs on the frontend

## License

[MIT](./LICENSE)
