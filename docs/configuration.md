# Configuration

All configuration is environment variables, read via `safeEnvGet(key)` (`server/safeEnvGet.ts`) — it throws the first time a missing variable is actually needed, not at import time, and not upfront for every variable the app could ever use. Copy `.env` to `.env.local` and fill it in.

There is no CLI argument parser (no `--only-run`, `--debug`, `--only`) — the only runtime flags are environment variables.

## Runtime flags

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | `production` enables cron jobs and disables Bun's dev/HMR mode | unset |
| `ENABLE_CRONS` | `true` runs cron jobs even when `NODE_ENV !== "production"` — use to test one job locally | unset |
| `USER_UID` | Development-only identity override: the Authentik UID to act as. Both this and `USER_NAME` must be set; only honored when `NODE_ENV` is `development` or `test` (Bun reports an unset `NODE_ENV` as `development`), and ignored whenever a request carries `x-authentik-uid` | unset |
| `USER_NAME` | Development-only identity override: the username paired with `USER_UID` | unset |

## Authentication (Authentik forwardAuth)

Every `/api/*` route, plus `GET /openapi` and `GET /openapi/json`, is deny-all: a request is only allowed when it carries an identity and the user holds the matching **route grant**. Access comes exclusively from explicit grants; there is no admin bypass.

The app trusts the headers the Authentik proxy outpost injects. It never validates a JWT itself:

- `x-authentik-uid` — required; becomes `auth.users.uid`.
- `x-authentik-username` — required; stored in `auth.users.username`.
- `x-authentik-name` — optional; shown in the drawer and `/api/me`, never stored, falls back to the username.

**Deployment requirements** (infrastructure, not this repository):

1. forwardAuth must cover the whole host, on every path.
2. The outpost response must overwrite the identity headers (in Traefik, list `X-authentik-uid`, `X-authentik-username`, `X-authentik-name` in `authResponseHeaders`), so a client cannot forge them.
3. The app port must not be published directly; the app is reachable only through the proxy.

**Development override.** Only when `NODE_ENV` is explicitly `development` or `test` (any other value, such as `staging`, disables it), when both `USER_UID` and `USER_NAME` are set and a request has no `x-authentik-uid`, those values are used. The header always wins. If only one variable is set, the server logs a warning and the override is ignored. `test/setup.ts` never sets them. The production `Dockerfile` sets `NODE_ENV=production`, so the override cannot activate in the deployed image.

**Bootstrap.** The first permission manager must be seeded manually, because a brand-new user has zero grants. Run the idempotent `server/db/sql/auth-bootstrap.sql` with your own UID and username (and optionally the `login_failed` service account) as described in the file header. It grants the owner every guarded route plus every existing Tuya resource and cron job. Frigate cameras are not in the database, so grant them through the **Permissões** dashboard afterwards. A service account omitted from the bootstrap is auto-created with zero grants on its first webhook call (which returns `403`); grant it `POST /api/authentik/login-failed` through the dashboard.

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
| `OPEN_ROUTER_API_KEY` | OpenRouter LLM calls (`server/modules/google/service/openrouter.ts`), and everything in the voice assistant (`server/modules/assistant`): the agent, ElevenLabs speech-to-text, Microsoft MAI text-to-speech and image generation, all through OpenRouter |
| `ASSISTANT_MODEL` | Optional OpenRouter model for the voice assistant's agent; defaults to `openai/gpt-5-mini` |
| `ASSISTANT_IMAGE_MODEL` | Optional OpenRouter image model for the assistant's `gerar_imagem` tool; defaults to `google/gemini-3-pro-image` |
| `ASSISTANT_TTS_MODEL` | Optional OpenRouter text-to-speech model for the assistant's replies; defaults to `microsoft/mai-voice-2.1-flash` (native pt-BR voices) |
| `ASSISTANT_VOICE` | Optional voice for `ASSISTANT_TTS_MODEL`; voices are model-specific. Defaults to `pt-BR-Luana:MAI-Voice-2.1-Flash` (others: `pt-BR-Caio`, `pt-BR-Pedro`, `pt-BR-Rafael`, `pt-BR-Harper`, `pt-BR-Grant`, with the same `:MAI-Voice-2.1-Flash` suffix). Set it whenever you change the model |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_ENDPOINT` | Read implicitly by Bun's built-in `Bun.s3` client. The voice assistant keeps its images (uploads, generated images, camera snapshots) in this **private** bucket under `assistant/<userId>/`, and hands the browser presigned URLs (`server/modules/assistant/service/images.ts`) |
| `DISCORD_DEFAULT_PUBLIC_KEY` | Discord bot token (`server/shared/discord.ts`) — the name is misleading, it's a bot token, not a public key |
| `AUTHENTIK_URL`, `AUTHENTIK_USERNAME`, `AUTHENTIK_PASSWORD` | Authentik client-credentials login (`server/shared/authentik.ts`) |
| `BIRTHDAY_SERVICE_CLIENT_ID`, `BIRTHDAY_SERVICE_ENDPOINT` | The birthday module's MCP call, authenticated via the above |
| `FRIGATE_CLIENT_ID`, `FRIGATE_ENDPOINT` | Frigate camera proxy (`server/modules/frigate`), authenticated via the above |
| `ROUTER_PASSWORD_SECRET` | Encrypts the TP-Link router's admin password at rest (`server/modules/tplink`) |
| `SSH_DEFAULT_HOST`, `SSH_DEFAULT_PORT`, `SSH_DEFAULT_USERNAME`, `SSH_DEFAULT_PRIVATE_KEY` | `server/shared/ssh.ts`, used by `server-metrics` |
| `STATS_SCRIPT_PATH` | Optional override for the remote stats script path; defaults to `/home/gsbenevides2/stats.sh` |
