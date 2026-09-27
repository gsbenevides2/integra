import { openobserveLogs } from "@openobserve/browser-logs";
import { openobserveRum } from "@openobserve/browser-rum";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  StackContextManager,
  WebTracerProvider,
} from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export function instrumentFrontend(): void {
  const serviceName = "integra-web";
  const traceUrl = `${window.location.origin}/v1/traces`;
  const options = {
    clientToken: process.env.PUBLIC_RUM_TOKEN!,
    applicationId: serviceName, // any string identifying your application
    site: process.env.PUBLIC_RUM_SITE!,
    organizationIdentifier: process.env.PUBLIC_OTEL_ORGANIZATION!,
    service: serviceName,
    env: "production",
    version: "0.0.1",
    insecureHTTP: false,
    apiVersion: "v1",
  };
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    spanProcessors: [
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
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: /.*/,
        // Don't trace the RUM/logs/traces beacons themselves.
        ignoreUrls: [traceUrl, new RegExp(`^https?://${options.site}`)],
      }),
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

  setTimeout(() => {
    window.dispatchEvent(new Event("loadTelemetry"));
  }, 1000);
}
