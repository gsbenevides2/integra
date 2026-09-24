/**
 * Wraps Bun's native fetch and the instrumentable Axios instance
 * so every outbound HTTP call creates a child span with W3C Trace
 * Context propagated in the headers.
 */
import { context, type Span, type Tracer } from "@opentelemetry/api";
import {
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_URL,
  SEMATTRS_HTTP_STATUS_CODE,
} from "@opentelemetry/semantic-conventions";
import { getTracer } from "./tracer";

// ---------------------------------------------------------------------------
// Bun fetch
// ---------------------------------------------------------------------------

/**
 * Create a wrapped fetch function that automatically creates child spans.
 * Pass the result to any library that accepts a custom fetch.
 */
export function createTracedFetch(tracer?: Tracer): typeof fetch {
  const otel = tracer ?? getTracer();
  const originalFetch = globalThis.fetch;

  return async function tracedFetch(input, init?) {
    const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    return otel.startActiveSpan(
      `HTTP ${method}`,
      {
        kind: 3, // CLIENT
        attributes: {
          [SEMATTRS_HTTP_METHOD]: method,
          [SEMATTRS_HTTP_URL]: url,
          "http.client": "bun-fetch",
        },
      },
      async (span: Span) => {
        try {
          const response = await originalFetch(input, init);
          span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);
          if (!response.ok && response.status >= 500) {
            span.setStatus({ code: 2, message: `HTTP ${response.status}` });
          } else {
            span.setStatus({ code: 1 });
          }
          return response;
        } catch (err) {
          span.setStatus({ code: 2, message: String(err) });
          span.recordException(err instanceof Error ? err : new Error(String(err)));
          throw err;
        } finally {
          span.end();
        }
      },
    );
  };
}

// ---------------------------------------------------------------------------
// Axios interceptor
// ---------------------------------------------------------------------------

/**
 * Patch an Axios instance so every request creates an OpenTelemetry span.
 *
 * @param axiosInstance - The Axios instance to instrument (e.g. instrumentableAxios).
 * @param tracer        - Optional custom tracer.
 * @returns The same instance (mutated in place).
 */
export function instrumentAxios(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  axiosInstance: any,
  tracer?: Tracer,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const otel = tracer ?? getTracer();

  axiosInstance.interceptors.request.use((config: Record<string, unknown>) => {
    const span = otel.startSpan(
      `HTTP ${(config.method as string)?.toUpperCase() ?? "GET"}`,
      {
        kind: 3, // CLIENT
        attributes: {
          [SEMATTRS_HTTP_METHOD]: config.method,
          [SEMATTRS_HTTP_URL]: config.url,
          "http.client": "axios",
        },
      },
      context.active(),
    );

    // Store span so the response interceptor can finalize it
    (config as Record<string, unknown>).__otel_span = span;
    return config;
  });

  axiosInstance.interceptors.response.use(
    (response: { config: Record<string, unknown>; status: number }) => {
      const span = response.config.__otel_span as Span | undefined;
      if (span) {
        span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);
        span.setStatus({ code: response.status >= 500 ? 2 : 1 });
        span.end();
      }
      return response;
    },
    (error: { config: Record<string, unknown>; response?: { status: number }; message: string }) => {
      const span = error.config?.__otel_span as Span | undefined;
      if (span) {
        const status = error.response?.status ?? 0;
        span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, status);
        span.setStatus({ code: 2, message: error.message });
        span.recordException(new Error(error.message));
        span.end();
      }
      throw error;
    },
  );

  return axiosInstance;
}