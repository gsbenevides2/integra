# Configuration

All configuration is environment variables, read via `safeEnvGet(key)` (`server/safeEnvGet.ts`) — it throws the first time a missing variable is actually needed, not at import time, and not upfront for every variable the app could ever use. Copy `.env` to `.env.local` and fill it in.

There is no CLI argument parser (no `--only-run`, `--debug`, `--only`) — the only runtime flags are environment variables.

## Runtime flags

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | `production` enables cron jobs and disables Bun's dev/HMR mode | unset |
| `ENABLE_CRONS` | `true` runs cron jobs even when `NODE_ENV !== "production"` — use to test one job locally | unset |

## Core

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Drizzle + Bun's SQL client) |
| `REDIS_URL` | Read implicitly by Bun's built-in `Bun.redis` client — not referenced explicitly in code |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Trace collector base URL (backend spans, and the frontend's proxied spans) |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers for the above, `key=value` pairs |
| `OTEL_SERVICE_NAME` | Service name shared by traces, logs and metrics (`server/instrumentation/resource.ts`); defaults to `integra` |
| `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` | Standard SDK sampling vars, read by the SDK. (`OTEL_SAMPLE_RATE` is **not** a real OTel var and is not read.) Unset = 100% sampling |
| `PUBLIC_RUM_TOKEN`, `PUBLIC_RUM_SITE`, `PUBLIC_OTEL_ORGANIZATION` | Frontend OpenObserve RUM/logs config (`public/instrumentFrontend.ts`) |
| `TZ` | Process timezone |

The HTTP port is hardcoded to `3000` in `server/index.ts` — unlike the old repo, there is no `PORT` env var override.

## Per-module

| Variable | Used by |
|----------|---------|
| `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET` | Tuya cloud API + Pulsar (`server/modules/tuya`) |
| `TUYA_DATA_CENTER` | Tuya data centre: `us`, `eu`, `cn` or `in` — defaults to `us` |
| `TUYA_PULSAR_ENV` | `test` selects Tuya's Pulsar test environment; anything else is prod |
| `GCP_OAUTH_CLIENT_ID`, `GCP_OAUTH_CLIENT_SECRET` | Google OAuth (`server/modules/google/service/accounts.ts`) |
| `OPEN_ROUTER_API_KEY` | OpenRouter LLM calls (`server/modules/google/service/openrouter.ts`) |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_ENDPOINT` | Read implicitly by Bun's built-in `Bun.s3` client (`server/modules/google/service/s3.ts`) |
| `DISCORD_DEFAULT_PUBLIC_KEY` | Discord bot token (`server/shared/discord.ts`) — the name is misleading, it's a bot token, not a public key |
| `AUTHENTIK_URL`, `AUTHENTIK_USERNAME`, `AUTHENTIK_PASSWORD` | Authentik client-credentials login (`server/shared/authentik.ts`) |
| `BIRTHDAY_SERVICE_CLIENT_ID`, `BIRTHDAY_SERVICE_ENDPOINT` | The birthday module's MCP call, authenticated via the above |
| `FRIGATE_CLIENT_ID`, `FRIGATE_ENDPOINT` | Frigate camera proxy (`server/modules/frigate`), authenticated via the above |
| `ROUTER_PASSWORD_SECRET` | Encrypts the TP-Link router's admin password at rest (`server/modules/tplink`) |
| `SSH_DEFAULT_HOST`, `SSH_DEFAULT_PORT`, `SSH_DEFAULT_USERNAME`, `SSH_DEFAULT_PRIVATE_KEY` | `server/shared/ssh.ts`, used by `server-metrics` |
| `STATS_SCRIPT_PATH` | Optional override for the remote stats script path; defaults to `/home/gsbenevides2/stats.sh` |
