/**
 * Core TracerProvider initialisation.
 *
 * Creates a TracerProvider configured with:
 *  - OTLP HTTP exporter (gRPC uses protobuf which is heavier; HTTP is simpler)
 *  - ParentBased sampler that respects the configured sample-rate
 *  - BatchSpanProcessor (flushes on a background schedule)
 *  - Semantic resource attributes
 *
 * The provider is registered as the global singleton so that
 * @opentelemetry/api's getTracer() works everywhere without manual wiring.
 */
import { context, trace, type Tracer } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOffSampler,
  AlwaysOnSampler,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { otelConfig } from "./config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createResource(): Resource {
  return new Resource({
    [SEMRESATTRS_SERVICE_NAME]: otelConfig.serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: otelConfig.serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: otelConfig.environment,
  });
}

/**
 * Sampler that respects OTEL_SAMPLE_RATE.
 * A rate of 0.0 disables tracing entirely; 1.0 samples everything.
 */
function createSampler(): import("@opentelemetry/sdk-trace-base").Sampler {
  if (otelConfig.sampleRate <= 0) return new AlwaysOffSampler();
  if (otelConfig.sampleRate >= 1) return new AlwaysOnSampler();
  return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(otelConfig.sampleRate) });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let _tracer: Tracer | null = null;
let _provider: NodeTracerProvider | null = null;

/**
 * Initialise the global TracerProvider.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * Returns the global tracer so callers can use it directly.
 */
export function initOpenTelemetry(): Tracer {
  if (_tracer) return _tracer;

  // 1. Context manager — required for async propagation in Node/Bun
  const contextManager = new AsyncHooksContextManager();
  context.setGlobalContextManager(contextManager.enable());

  // 2. Provider with resource + sampler
  const provider = new NodeTracerProvider({
    resource: createResource(),
    sampler: createSampler(),
  });

  // 3. OTLP exporter + batch processor
  const exporter = new OTLPTraceExporter({
    url: otelConfig.endpoint,
    // Timeout is generous so transient collector blips don't cascade
    timeoutMillis: 10_000,
  });

  provider.addSpanProcessor(
    new BatchSpanProcessor(exporter, {
      maxExportBatchSize: 128,
      scheduledDelayMillis: 5_000,
      exportTimeoutMillis: 10_000,
    }),
  );

  // 4. Register global
  provider.register();
  _provider = provider;
  _tracer = trace.getTracer(otelConfig.serviceName, otelConfig.serviceVersion);

  console.log(`[otel] TracerProvider initialised → ${otelConfig.endpoint} (rate=${otelConfig.sampleRate})`);
  return _tracer;
}

/**
 * Gracefully shut down — flushes remaining spans.
 * Call on SIGTERM / SIGINT.
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (!_provider) return;
  try {
    await _provider.shutdown();
    console.log("[otel] TracerProvider shut down");
  } catch (err) {
    console.error("[otel] Shutdown error:", err);
  }
  _provider = null;
  _tracer = null;
}

/** Convenience: get the current tracer (must call initOpenTelemetry first). */
export function getTracer(): Tracer {
  if (!_tracer) throw new Error("OpenTelemetry not initialised — call initOpenTelemetry() first");
  return _tracer;
}