import type { ClientConfig } from "@server/modules/client-config";

import { openobserveLogs } from "@openobserve/browser-logs";
import { openobserveRum } from "@openobserve/browser-rum";
import { SpanStatusCode } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  StackContextManager,
  WebTracerProvider,
} from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

import { APP_VERSION } from "./version";

/** Current RUM session id, used to join OTel traces with RUM sessions. */
export function getRumSessionId(): string | undefined {
  try {
    return openobserveRum.getInternalContext()?.session_id;
  } catch {
    return undefined;
  }
}

/** RUM settings come from the server at runtime, so the bundle can be prebuilt. */
async function fetchRumConfig(): Promise<ClientConfig["rum"]> {
  try {
    const response = await fetch("/client-config");
    return response.ok ? ((await response.json()) as ClientConfig).rum : null;
  } catch {
    return null;
  }
}

export async function instrumentFrontend(): Promise<void> {
  const rum = await fetchRumConfig();
  if (!rum) return;
  const serviceName = "integra-web";
  const traceUrl = `${window.location.origin}/v1/traces`;
  const options = {
    clientToken: rum.clientToken,
    applicationId: serviceName, // any string identifying your application
    site: rum.site,
    organizationIdentifier: rum.organization,
    service: serviceName,
    env: rum.env,
    version: APP_VERSION,
    insecureHTTP: false,
    apiVersion: "v1",
  };
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      "service.version": APP_VERSION,
      "deployment.environment.name": options.env,
    }),
    spanProcessors: [
      // Tag every span with the RUM session so traces and RUM sessions join.
      {
        onStart: (span) => {
          const sessionId = getRumSessionId();
          if (sessionId) span.setAttribute("session.id", sessionId);
        },
        onEnd: () => {},
        forceFlush: () => Promise.resolve(),
        shutdown: () => Promise.resolve(),
      },
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: traceUrl,
        }),
      ),
    ],
  });

  provider.register({ contextManager: new StackContextManager() });
  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new UserInteractionInstrumentation({
        shouldPreventSpanCreation: (_eventType, element, span) => {
          span.setAttribute("target.label", element.textContent ?? "");
        },
      }),
    ],
  });

  openobserveRum.init({
    applicationId: options.applicationId,
    clientToken: options.clientToken,
    site: options.site,
    organizationIdentifier: options.organizationIdentifier,
    service: options.service,
    env: options.env,
    version: options.version,
    trackResources: true,
    trackLongTasks: true,
    trackUserInteractions: true,
    apiVersion: options.apiVersion,
    insecureHTTP: options.insecureHTTP,
    defaultPrivacyLevel: "allow",
    // Kept in memory only (no cookie/localStorage), so a page reload always
    // starts a brand new RUM session instead of resuming the previous one.
    sessionPersistence: "memory",
    // RUM is the single owner of traceparent propagation: it injects the header
    // and stores the same trace_id on the RESOURCE event, which is what lets the
    // OpenObserve RUM UI jump from a front-end request to its backend trace.
    // (Don't add OTel FetchInstrumentation back: two injectors = two trace ids.)
    // Not user traffic: our own span exporter (POST /v1/traces) and static
    // assets (css/js/img/font/media) are dropped from RUM to keep sessions readable.
    beforeSend: (event) =>
      !(
        event.type === "resource" &&
        (["css", "js", "image", "font", "media"].includes(
          event.resource.type,
        ) ||
          new URL(event.resource.url, window.location.origin).pathname ===
            "/v1/traces")
      ),
    allowedTracingUrls: [
      {
        match: `${window.location.origin}/api`,
        propagatorTypes: ["tracecontext"],
      },
    ],
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
  });

  openobserveLogs.init({
    clientToken: options.clientToken,
    site: options.site,
    organizationIdentifier: options.organizationIdentifier,
    service: options.service,
    env: options.env,
    version: options.version,
    forwardErrorsToLogs: true,
    insecureHTTP: options.insecureHTTP,
    apiVersion: options.apiVersion,
  });

  openobserveRum.startSessionReplayRecording();

  // Uncaught errors / rejections become spans, linked to the active trace.
  const tracer = provider.getTracer("errors");
  const recordError = (name: string, error: unknown) => {
    const span = tracer.startSpan(name);
    span.recordException(error instanceof Error ? error : String(error));
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  };
  window.addEventListener("error", (e) =>
    recordError("window.error", e.error ?? e.message),
  );
  window.addEventListener("unhandledrejection", (e) =>
    recordError("window.unhandledrejection", e.reason),
  );
}
