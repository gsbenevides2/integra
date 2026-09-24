/**
 * OpenTelemetry Configuration
 *
 * All settings read from environment variables so they work equally in
 * development, CI, and production without code changes.
 */
export const otelConfig = {
  /** OTLP endpoint (gRPC or HTTP). Default: http://localhost:4318/v1/traces */
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? "http://localhost:4318/v1/traces",

  /** Service name that appears in traces */
  serviceName: process.env.OTEL_SERVICE_NAME ?? "integra",

  /** Service version (from package.json at runtime) */
  serviceVersion: process.env.OTEL_SERVICE_VERSION ?? "1.0.0",

  /** Deployment environment: development | staging | production */
  environment: process.env.OTEL_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",

  /**
   * Trace-sample ratio (0.0–1.0).
   *  1.0  = sample everything (dev)
   *  0.1  = sample 10 % (common prod default)
   *  0.0  = disable tracing entirely
   */
  sampleRate: parseFloat(process.env.OTEL_SAMPLE_RATE ?? "1.0"),

  /**
   * If true the application continues normally when the collector
   * is unreachable — spans are dropped silently instead of crashing.
   * This is always true in this implementation; the env var is
   * documented for production tuning.
   */
  noCrashOnCollectorFailure: process.env.OTEL_NO_CRASH !== "false",
} as const;

export type OtelConfig = typeof otelConfig;