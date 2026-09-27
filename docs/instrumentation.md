# Instrumentation

Every HTTP request, outgoing `fetch`, database query and cron run is traced with **OpenTelemetry** and exported via OTLP to an external collector. There is no custom tracer and no app-owned "runs"/"run_events" table like the old repo had — tracing data lives entirely outside this app's own database.

## Backend

### HTTP requests — `server/instrumentation/instrumentHttpServer.ts`

The `elysiaOtel` plugin (built on `@elysia/opentelemetry`) wraps the whole app:

- Opens a span per request, records request headers/body as span attributes (`headersToSpanAttributes`, `recordBody: true`).
- `onAfterHandle` records the response's headers/body/size onto the same span.
- `onError` marks the span as errored with the caught message.
- Exports spans via `OTLPTraceExporter` + `BatchSpanProcessor` to `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Also exposes `POST /v1/traces`, which **proxies the frontend's own spans** to the real collector, attaching `OTEL_EXPORTER_OTLP_HEADERS` server-side — so the collector's auth header never has to reach the browser bundle.

Because this plugin wraps every mounted route automatically, a module's `index.ts` needs no manual `traceId`/`triggerId` decorators (unlike the old repo's `TypedElysia()`).

### Outgoing HTTP calls — `server/instrumentation/instrumentFetch.ts`

`instrumentFetch()` (called once, at the top of `server/index.ts`) monkey-patches `globalThis.fetch`:

- Every call gets its own span (`"<METHOD> <hostname>"`, `SpanKind.CLIENT`), recording request/response headers, bodies, sizes and status code.
- Injects W3C trace-context headers into the outgoing request (`propagation.inject`), so a call from this app to another service you also instrument continues the same trace.
- Skips tracing calls to the OTLP endpoint itself, to avoid feedback loops.

Because this patches the global `fetch`, **no module needs to reach for a special "traced fetch" helper** — a plain `fetch(url)` anywhere in the codebase is already traced.

### Database queries — `server/instrumentation/instrumentDb.ts`

`instrumentDb(client, connectionUrl)` wraps Bun's `SQL` client (used by `server/db/index.ts`) in a `Proxy` that intercepts every query's `.then()`, opening a `db.query` span with the executed statement, its parameters, and the row count/body of the result. Drizzle's chained `.values()`/`.raw()` calls are unaffected since the same query instance is returned.

### Cron jobs — `server/cron.ts`

Every scheduled job is wrapped by a local `tracedCronJob(name, fn)` helper: opens a span named `cron.<name>`, and — critically — **catches and records the job's error instead of letting it propagate**, so one failing job (a router that's down, an SSH box unreachable) never crashes the process or blocks the next job from registering.

### Manual spans

Reach for `trace.getTracer("<name>").startActiveSpan(...)` directly only when neither of the above covers the call — e.g. `server/shared/ssh.ts` wraps `node-ssh`'s `execCommand` in its own span, since that's neither an HTTP call nor a DB query. Look at that file for the pattern (`SpanKind.CLIENT`, record the exception, set the status, always `span.end()` in `finally`).

## Frontend — `public/instrumentFrontend.ts`

Wires up:

- **OpenTelemetry web SDK** (`WebTracerProvider` + `FetchInstrumentation`, `DocumentLoadInstrumentation`, `UserInteractionInstrumentation`), exporting to `/v1/traces` on this app's own origin — which the backend then proxies to the real collector (see above).
- **OpenObserve RUM + logs** (`@openobserve/browser-rum`/`browser-logs`) — session replay, resource/long-task tracking, forwarded console errors. Configured via `PUBLIC_RUM_TOKEN`, `PUBLIC_RUM_SITE`, `PUBLIC_OTEL_ORGANIZATION`.
- Session persistence is deliberately `"memory"` (not cookie/localStorage) — a page reload always starts a fresh RUM session.

## What replaced the old repo's tracer

| Old repo | This repo |
|----------|-----------|
| `addTracerEvent()` / `startTracer()` / `endTracer()` | Automatic OTEL spans (HTTP, fetch, DB) + manual `startActiveSpan()` where needed |
| `instrumentableFetch(traceId, ...)` | Plain `fetch()` — already traced globally |
| Postgres `runs`/`run_events` tables + a React "Execution Logs" dashboard | An external OTEL/OpenObserve collector — nothing queryable from inside this app |
| `traceId` threaded manually through every function call | OTEL's active-span context, propagated automatically (including across an outgoing `fetch`) |
