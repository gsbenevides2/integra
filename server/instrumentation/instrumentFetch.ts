import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

import { httpClientDuration } from "./metrics";
import { openRouterLlmSpan } from "./openinference";
import { recordSpanError } from "./withSpan";

function headerAttributes(
  prefix: string,
  headers: Headers,
): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [key, value] of headers.entries())
    attributes[`${prefix}.${key.toLowerCase()}`] = value;
  return attributes;
}

/** Reads a Request/Response's body without consuming it for the real caller. */
async function peekBody(
  resource: Request | Response,
): Promise<string | undefined> {
  if (!resource.body) return undefined;
  try {
    const text = await resource.clone().text();
    return text || undefined;
  } catch {
    return undefined;
  }
}

type PreconnectOptions = Parameters<typeof globalThis.fetch.preconnect>["1"];

/**
 * Extended init type that allows callers to bypass the entire instrumented
 * fetch per-request. Set `skipInstrumentation: true` to skip ALL fetch
 * instrumentation (reconstruction, tracing, header injection) — useful for
 * routers, IoT devices, and other targets that don't handle reconstructed
 * Request objects (e.g. TP-Link routers).
 */
export interface InstrumentedInit extends RequestInit {
  skipInstrumentation?: boolean;
}

export function instrumentFetch(): void {
  const originalFetch = globalThis.fetch;
  const tracer = trace.getTracer("fetch");
  // Read once: never trace the OTLP exporter itself (infinite loop).
  const otlpHost = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? new URL(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).host
    : undefined;

  const newFetch = async (
    input: string | Request | URL,
    init?: InstrumentedInit,
  ) => {
    // Bypass before reconstructing the Request: callers opting out (routers,
    // IoT devices) can't handle a rebuilt Request.
    if (init?.skipInstrumentation) return originalFetch(input, init);
    const rawUrl = input instanceof Request ? input.url : input.toString();
    if (otlpHost && rawUrl.includes(otlpHost)) {
      return originalFetch(input, init);
    }

    const request = new Request(input, init);
    const url = new URL(request.url);

    return tracer.startActiveSpan(
      `${request.method} ${url.hostname}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "http.request.method": request.method,
          "url.full": request.url,
          "server.address": url.hostname,
          "server.port": Number(url.port || (url.protocol === "https:" ? 443 : 80)),
          service_name: url.hostname,
        },
      },
      async (span) => {
        const start = performance.now();
        let statusCode = 0;
        try {
          span.setAttributes(
            headerAttributes("http.request.header", request.headers),
          );

          const requestBody = await peekBody(request);
          if (requestBody !== undefined) {
            span.setAttribute("http.request.body", requestBody);
            span.setAttribute(
              "http.request.body.size",
              Buffer.byteLength(requestBody),
            );
          }

          const headers = new Headers(request.headers);
          propagation.inject(context.active(), headers, {
            set: (carrier, key, value) => carrier.set(key, value),
          });

          const response = await originalFetch(
            new Request(request, { headers }),
          );

          statusCode = response.status;
          span.setAttribute("http.response.status_code", response.status);
          span.setAttributes(
            headerAttributes("http.response.header", response.headers),
          );
          if (!response.ok) {
            span.setAttribute("error.type", String(response.status));
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${response.status} ${response.statusText}`,
            });
          }

          const responseBody = await peekBody(response);
          if (responseBody !== undefined) {
            span.setAttribute("http.response.body", responseBody);
            span.setAttribute(
              "http.response.body.size",
              Buffer.byteLength(responseBody),
            );
          }

          // OpenObserve's AI views read OpenInference attributes. The agent's
          // OpenRouter calls have no OpenAI SDK to auto-instrument, so the
          // already-buffered request/response are translated here.
          const llm = openRouterLlmSpan(url, requestBody, responseBody);
          if (llm) {
            span.updateName(llm.name);
            span.setAttributes(llm.attributes);
          }

          return response;
        } catch (error) {
          recordSpanError(span, error);
          throw error;
        } finally {
          httpClientDuration.record(performance.now() - start, {
            "http.request.method": request.method,
            "server.address": url.hostname,
            "http.response.status_code": statusCode,
          });
          span.end();
        }
      },
    );
  };

  newFetch.preconnect = (url: string | URL, options: PreconnectOptions) => {
    originalFetch.preconnect(url, options);
  };
  globalThis.fetch = newFetch;
}
