/**
 * Elysia middleware for OpenTelemetry HTTP tracing.
 *
 * Creates a root span for every incoming request, attaches semantic
 * HTTP attributes, and marks errors when the status code ≥ 500.
 *
 * The existing custom tracer (startTracer / endTracer) runs in parallel
 * and provides real-time WebSocket dashboard updates. This middleware
 * adds W3C Trace Context propagation and OTLP-exported spans.
 */
import { context, propagation, type Span, type Tracer } from "@opentelemetry/api";
import { type Elysia, type StatusCode, StatusMap } from "elysia";
import { REQUEST_ID_HEADER } from "core/triggers/http/types";
import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_URL, SEMATTRS_HTTP_TARGET, SEMATTRS_HTTP_STATUS_CODE, SEMATTRS_HTTP_ROUTE, SEMATTRS_HTTP_FLAVOR } from "@opentelemetry/semantic-conventions";
import { getTracer } from "./tracer";

/**
 * Wrap an Elysia instance with OpenTelemetry tracing middleware.
 *
 * @param app - The Elysia app to instrument.
 * @param tracer - Optional custom tracer (defaults to global tracer).
 * @returns The same Elysia instance, now instrumented.
 */
export function instrumentElysia(app: Elysia, tracer?: Tracer): Elysia {
  const otel = tracer ?? getTracer();

  return app
    // ── Incoming request root span ──────────────────────────────────
    .on("request", ({ request, set }) => {
      // Extract W3C Trace Context from incoming headers (if any)
      const activeContext = propagation.extract(context.active(), request.headers);
      const span = otel.startSpan(
        `${request.method} ${new URL(request.url).pathname}`,
        {
          kind: 1, // SERVER
          attributes: {
            [SEMATTRS_HTTP_METHOD]: request.method,
            [SEMATTRS_HTTP_URL]: request.url,
            [SEMATTRS_HTTP_TARGET]: new URL(request.url).pathname,
            [SEMATTRS_HTTP_FLAVOR]: request.headers.get(":scheme") ?? "HTTP/1.1",
            [SEMATTRS_HTTP_ROUTE]: request.url, // will be refined on route match
          },
        },
        activeContext,
      );

      // Store the span on the response headers for downstream access
      // Also propagate trace context via the existing request-id header
      const spanContext = span.spanContext();
      set.headers[REQUEST_ID_HEADER] = `${spanContext.traceId}-${spanContext.spanId}`;

      // Attach span to the request object for .onAfterResponse / .onError
      (request as Record<string, unknown>).__otel_span = span;
    })

    // ── Refine route on before-handle ──────────────────────────────
    .onBeforeHandle(({ request, route }) => {
      const span = (request as Record<string, unknown>).__otel_span as Span | undefined;
      if (!span) return;
      if (route) {
        span.setAttribute(SEMATTRS_HTTP_ROUTE, route);
      }
    })

    // ── Finalize span on response ──────────────────────────────────
    .onAfterResponse(({ request, set }) => {
      const span = (request as Record<string, unknown>).__otel_span as Span | undefined;
      if (!span) return;

      let statusCode: number;
      if (typeof set.status === "number") {
        statusCode = set.status;
      } else if (typeof set.status === "string") {
        statusCode = StatusMap[set.status as StatusCode] ?? 200;
      } else {
        statusCode = 200;
      }

      span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, statusCode);
      if (statusCode >= 500) {
        span.setStatus({ code: 2, message: `HTTP ${statusCode}` }); // ERROR
      } else {
        span.setStatus({ code: 1 }); // OK
      }
      span.end();
    })

    // ── Handle errors ──────────────────────────────────────────────
    .onError(({ request, error }) => {
      const span = (request as Record<string, unknown>).__otel_span as Span | undefined;
      if (!span) return;

      span.setStatus({
        code: 2, // ERROR
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.end();
    });
}

/**
 * Refine the HTTP route for an existing span — call this inside
 * route handlers that know their canonical route pattern.
 */
export function setHttpRoute(span: Span, route: string): void {
  span.setAttribute(SEMATTRS_HTTP_ROUTE, route);
}