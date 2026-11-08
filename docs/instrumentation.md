# Instrumentation

Every HTTP request, outgoing `fetch`, database query and cron run is traced (plus logs and metrics, below) with **OpenTelemetry** and exported via OTLP to an external collector. There is no custom tracer and no app-owned "runs"/"run_events" table like the old repo had — tracing data lives entirely outside this app's own database.

## Backend

### HTTP requests — `server/instrumentation/instrumentHttpServer.ts`

The `elysiaOtel` plugin (built on `@elysia/opentelemetry`) wraps the whole app:

- Opens a span per request, records request headers/body as span attributes (`headersToSpanAttributes`, `recordBody: true`).
- `onAfterHandle` records the response's headers/body/size onto the same span.
- `onError` records the exception (`recordException`, `error.type`) and marks the span as errored.
- Exports spans via `OTLPTraceExporter` + `BatchSpanProcessor` to `OTEL_EXPORTER_OTLP_ENDPOINT`, and installs the global `MeterProvider` (OTLP metrics, `PeriodicExportingMetricReader`) so every meter in the app is exported.
- Uses the shared `appResource` (`server/instrumentation/resource.ts`: `service.name`, `service.version`, `deployment.environment.name`, `service.instance.id`) — the same resource logs use.
- Also exposes `POST /v1/traces`, which **proxies the frontend's own spans** to the real collector, attaching `OTEL_EXPORTER_OTLP_HEADERS` server-side — so the collector's auth header never has to reach the browser bundle.

Because this plugin wraps every mounted route automatically, a module's `index.ts` needs no manual `traceId`/`triggerId` decorators (unlike the old repo's `TypedElysia()`).

### Outgoing HTTP calls — `server/instrumentation/instrumentFetch.ts`

`instrumentFetch()` (called once, at the top of `server/index.ts`) monkey-patches `globalThis.fetch`:

- Every call gets its own span (`"<METHOD> <hostname>"`, `SpanKind.CLIENT`), recording request/response headers, bodies, sizes and status code.
- Injects W3C trace-context headers into the outgoing request (`propagation.inject`), so a call from this app to another service you also instrument continues the same trace.
- Skips tracing calls to the OTLP endpoint itself, to avoid feedback loops. Callers can pass `skipInstrumentation: true` (type `InstrumentedInit`) to bypass tracing entirely (routers/IoT devices).
- Records `http.client.request.duration` (ms) by host, method and status.
- Non-2xx responses mark the span ERROR with `error.type`. Bodies are captured in full (no size cap).

**Google APIs** go through `gaxios` → `node-fetch`, not `globalThis.fetch`, so `instrumentGaxios.ts` patches `Gaxios.prototype.request` with its own CLIENT span (`peer.service: google-api`). There is no double span.

Because this patches the global `fetch`, **no module needs to reach for a special "traced fetch" helper** — a plain `fetch(url)` anywhere in the codebase is already traced.

### AI / LLM observability — `server/instrumentation/openinference.ts`

OpenObserve's AI views read [OpenInference](https://arize-ai.github.io/openinference/spec/) attributes. The official OpenAI instrumentor only patches the `openai` SDK, which this app does not use: the voice assistant calls OpenRouter through `@openrouter/agent` (its own SDK), and the Google jobs call the Chat Completions HTTP API directly. So the conventions are applied manually (no extra dependency):

- **Agent:** the `assistant.chat` span is marked `openinference.span.kind = "AGENT"`, with `agent.name`, `session.id`/`gen_ai.conversation.id` (the assistant conversation id), `input.value`/`output.value`, and the user identity. OpenObserve's Sessions view reads `user.id`, so it carries the login (`username`) rather than the internal UUID; the display name, Authentik UID and database id go in `user.name`, `user.uid` and `user.db_id`.
- **LLM:** `instrumentFetch` translates the already-captured OpenRouter `/responses` and `/chat/completions` bodies (JSON or SSE) into `openinference.span.kind = "LLM"` spans: `llm.model_name`, input/output messages, advertised tools, token counts (including cache and reasoning), cost and finish reason. The same code also covers `chatJson` calls from Google jobs, which have no agent parent.
- **Cost:** OpenObserve only reads a self-reported cost from `gen_ai.usage.cost` (it ignores `llm.cost.total` and would otherwise estimate from its price table), so both shapes are emitted. The per-direction breakdown comes from OpenRouter's `cost_details` (`upstream_inference_input_cost`/`output_cost` on Responses, `upstream_inference_prompt_cost`/`completions_cost` on Chat Completions).
- **Tool:** every `guardedTool` execution gets a `TOOL` span with `tool.name`, `tool.description`, and JSON `input.value`/`output.value` (capped at `MAX_ATTRIBUTE_CHARS`).

Other OpenRouter endpoints (speech-to-text, text-to-speech, image generation) remain plain HTTP spans.

### Database queries — `server/instrumentation/instrumentDb.ts`

`instrumentDb(client, connectionUrl)` wraps Bun's `SQL` client (used by `server/db/index.ts`) in a `Proxy` that intercepts every query's `.then()`, opening a `<OPERATION> <table>` span (e.g. `SELECT users`) with `db.query.text`, `db.query.parameters`, `db.operation.name`, `db.collection.name` and the row count/body of the result, and recording `db.client.operation.duration`. Drizzle's chained `.values()`/`.raw()` calls are unaffected since the same query instance is returned.

### Cron jobs — `server/cron.ts`

Every scheduled job is wrapped by a local `tracedCronJob(name, fn)` helper: opens a span named `cron.<name>`, and — critically — **catches and records the job's error instead of letting it propagate** (and emits `cron.job.runs` / `cron.job.duration` by `cron.job.name` and `outcome`), so one failing job (a router that's down, an SSH box unreachable) never crashes the process or blocks the next job from registering.

### Manual spans — `server/instrumentation/withSpan.ts`

Use `withSpan(tracer, name, { kind, attributes }, async (span) => ...)` when neither of the above covers the call (ssh, redis, s3, authentik, tplink, pulsar). It records the exception + `error.type`, sets ERROR on failure, leaves status UNSET on success (semconv) and always ends the span. Swallowed-but-meaningful failures (e.g. a status-platform fetcher that is stored as DOWN) should still call `span.recordException`.

### Logs — `server/instrumentation/instrumentLogger.ts`

`getLogger(name)` + `logInfo/logWarn/logError(logger, message, attrs)` emit OTLP log records carrying the active `trace_id`/`span_id` (so logs join their traces) and also mirror to stdout. Prefer these over `console.*` in server code.

### Metrics — `server/instrumentation/metrics.ts`

`cron.job.runs`, `cron.job.duration`, `cache.requests{result}`, `http.client.request.duration`, `db.client.operation.duration`, `pulsar.events`, and the observable gauge `tplink.circuit_breaker.open`.

### Shutdown — `server/instrumentation/shutdown.ts`

`flushTelemetryOnExit()` flushes spans, logs and metrics on SIGTERM/SIGINT so the last batch isn't lost on restart.

## Frontend — `public/instrumentFrontend.ts`

Wires up:

- **OpenTelemetry web SDK** (`WebTracerProvider` + `FetchInstrumentation`, `DocumentLoadInstrumentation`, `UserInteractionInstrumentation`), the single owner of `traceparent` propagation (same-origin only); every span carries the RUM `session.id`, and uncaught errors / unhandled rejections become spans. Exporting to `/v1/traces` on this app's own origin — which the backend then proxies to the real collector (see above).
- **OpenObserve RUM + logs** (`@openobserve/browser-rum`/`browser-logs`) — session replay, resource/long-task tracking, forwarded console errors. Configured via `PUBLIC_RUM_TOKEN`, `PUBLIC_RUM_SITE`, `PUBLIC_OTEL_ORGANIZATION`.
- **RUM ↔ trace correlation**: join on the `session.id` span attribute (front) and on `trace_id` (front → backend). RUM does not inject its own trace headers.
- Session persistence is deliberately `"memory"` (not cookie/localStorage) — a page reload always starts a fresh RUM session.

## What replaced the old repo's tracer

| Old repo | This repo |
|----------|-----------|
| `addTracerEvent()` / `startTracer()` / `endTracer()` | Automatic OTEL spans (HTTP, fetch, DB) + manual `startActiveSpan()` where needed |
| `instrumentableFetch(traceId, ...)` | Plain `fetch()` — already traced globally |
| Postgres `runs`/`run_events` tables + a React "Execution Logs" dashboard | An external OTEL/OpenObserve collector — nothing queryable from inside this app |
| `traceId` threaded manually through every function call | OTEL's active-span context, propagated automatically (including across an outgoing `fetch`) |
