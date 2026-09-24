/**
 * OpenTelemetry frontend tracing — loaded by the browser.
 *
 * This file is built by Bun into `assets/otel-tracing.js` and served as
 * a static asset. It is loaded by the App's <head> via the script tag
 * injected in `index.tsx`.
 *
 * It instruments:
 *  - fetch / XMLHttpRequest (automatic via web TracerProvider)
 *  - User clicks on traceable elements
 *  - SPA navigation via patching history.pushState
 *  - Unhandled errors / promise rejections
 *
 * Because the browser bundles must NOT include Node.js APIs, we import
 * from the web-appropriate OpenTelemetry packages.
 */
// @ts-nocheck — this file runs in the browser via Bun build, not in TS strict mode

import { context, trace, propagation } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";
import { registerInstrumentations } from "@opentelemetry/instrumentation";

// ---------------------------------------------------------------------------
// Configuration (mirrors the server-side env with browser-compatible fallbacks)
// ---------------------------------------------------------------------------

const CONFIG = {
  endpoint: window.location.port === "3000"
    ? "http://localhost:4318/v1/traces"
    : `${window.location.origin}/v1/traces`, // proxied through Elysia in production
  serviceName: "integra-frontend",
  serviceVersion: "1.0.0",
  sampleRate: 1.0,
};

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

let initialized = false;

export function initFrontendTracing(): void {
  if (initialized) return;
  initialized = true;

  // 1. Propagator — W3C Trace Context
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  // 2. Context manager — Zone.js for async tracking
  context.setGlobalContextManager(new ZoneContextManager());

  // 3. Provider
  const provider = new WebTracerProvider({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: CONFIG.serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: CONFIG.serviceVersion,
    }),
  });

  // 4. Exporter
  const exporter = new OTLPTraceExporter({ url: CONFIG.endpoint });
  provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  provider.register();

  // 5. Auto-instrumentation
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: /.*/,
        clearTimingResources: true,
      }),
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: /.*/,
      }),
      new UserInteractionInstrumentation({
        // Only capture clicks on elements with data-otel-track or buttons/links
        eventNames: ["click"],
        shouldPreventSpanCreation: (event) => {
          const target = event.target;
          if (target instanceof HTMLElement) {
            // Only trace clicks on interactive elements or data-otel-track elements
            const tag = target.tagName.toLowerCase();
            return !["button", "a", "input", "select"].includes(tag) && !target.hasAttribute("data-otel-track");
          }
          return true; // skip non-HTML targets
        },
      }),
    ],
  });

  // 6. SPA navigation tracing
  patchHistoryNavigation(provider.getTracer("navigation"));

  // 7. Error tracing
  traceErrors(provider.getTracer("errors"));

  console.log("[otel-frontend] Tracing initialised →", CONFIG.endpoint);
}

// ---------------------------------------------------------------------------
// SPA navigation
// ---------------------------------------------------------------------------

function patchHistoryNavigation(tracer: import("@opentelemetry/api").Tracer): void {
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (data, title, url) {
    const span = tracer.startSpan(`navigate ${url ?? "/"}`, {
      attributes: { "app.navigation.type": "spa-pushstate", "app.navigation.url": url ?? "/" },
    });
    try {
      return originalPushState(data, title, url);
    } finally {
      span.end();
    }
  };

  window.addEventListener("popstate", () => {
    const span = tracer.startSpan(`navigate ${location.pathname}`, {
      attributes: { "app.navigation.type": "popstate", "app.navigation.url": location.href },
    });
    span.end();
  });
}

// ---------------------------------------------------------------------------
// Error tracing
// ---------------------------------------------------------------------------

function traceErrors(tracer: import("@opentelemetry/api").Tracer): void {
  window.addEventListener("error", (event) => {
    const span = tracer.startSpan("unhandled.error", {
      attributes: {
        "app.error.message": event.message ?? String(event.error),
        "app.error.filename": event.filename ?? "",
        "app.error.lineno": event.lineno ?? 0,
        "app.error.colno": event.colno ?? 0,
      },
    });
    span.setStatus({ code: 2, message: event.message ?? "Unhandled error" });
    span.end();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const span = tracer.startSpan("unhandled.promise.rejection", {
      attributes: {
        "app.error.message": reason instanceof Error ? reason.message : String(reason),
      },
    });
    span.setStatus({ code: 2, message: "Unhandled Promise rejection" });
    span.recordException(reason instanceof Error ? reason : new Error(String(reason)));
    span.end();
  });
}

// Auto-init if not running in a test environment
if (typeof document !== "undefined" && !/test/i.test(location?.hostname ?? "")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initFrontendTracing());
  } else {
    initFrontendTracing();
  }
}