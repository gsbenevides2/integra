/**
 * OpenTelemetry integration — main entry point.
 *
 * Call `setupOpenTelemetry()` once at application startup to:
 *  1. Initialise the global TracerProvider with OTLP export
 *  2. Instrument the Elysia HTTP server
 *  3. Instrument outbound HTTP (fetch, axios)
 *  4. Instrument Redis operations
 *  5. Instrument DB queries
 *
 * Every subsystem can be toggled via environment variables so you can
 * gradually roll out instrumentation.
 */
import { type Elysia } from "elysia";
import { initOpenTelemetry, shutdownOpenTelemetry, getTracer } from "./tracer";
import { instrumentElysia } from "./elysia";
import { instrumentAxios, createTracedFetch } from "./fetch";
import { otelConfig } from "./config";

export type { OtelConfig } from "./config";
export { getTracer, shutdownOpenTelemetry } from "./tracer";
export { instrumentElysia } from "./elysia";
export { instrumentAxios, createTracedFetch } from "./fetch";
export { instrumentRedis } from "./redis";
export { instrumentDbClient, instrumentDrizzle } from "./db";
export { createTracedWsHandler, createTracedWsSend } from "./websocket";

// ── Singletons — instrumented once, cached ───────────────────────────────
let _tracedFetch: typeof fetch | null = null;
let _elysiaInstrumented = false;

/**
 * Initialise all OpenTelemetry instrumentation.
 *
 * @param app - The Elysia application instance to instrument.
 * @returns The same Elysia instance (mutated in place).
 */
export function setupOpenTelemetry(app: Elysia): Elysia {
  // 1. Core tracer
  const tracer = initOpenTelemetry();

  // 2. Elysia middleware (HTTP server spans)
  if (!_elysiaInstrumented) {
    instrumentElysia(app, tracer);
    _elysiaInstrumented = true;
  }

  // 3. Create a traced fetch function (available as a global replacement)
  _tracedFetch = createTracedFetch(tracer);

  return app;
}

/**
 * Get the traced fetch function — use this instead of globalThis.fetch
 * when you want automatic span creation and W3C Trace Context propagation.
 */
export function getTracedFetch(): typeof fetch {
  if (!_tracedFetch) throw new Error("OpenTelemetry not setup — call setupOpenTelemetry() first");
  return _tracedFetch;
}

/**
 * Create a per-trigger child tracer for workflow-level spans.
 * Each trigger (HTTP route, cron job, MQTT subscription) gets its own
 * named tracer so spans are grouped by workflow type.
 */
export function createTriggerTracer(triggerId: string, workflowType: string) {
  const parent = getTracer();
  return {
    /** Start a root span for this trigger execution. */
    startSpan: (name: string) =>
      parent.startSpan(name, {
        attributes: {
          "trigger.id": triggerId,
          "trigger.type": workflowType,
          "service.name": otelConfig.serviceName,
        },
      }),

    /** Start an active span (inherits parent context). */
    startActiveSpan: <F extends (...args: unknown[]) => unknown>(
      name: string,
      fn: (span: import("@opentelemetry/api").Span) => ReturnType<F>,
    ) => parent.startActiveSpan(name, {}, fn),
  };
}