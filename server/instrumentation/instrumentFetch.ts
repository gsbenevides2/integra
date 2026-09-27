import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

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

export function instrumentFetch(): void {
  const originalFetch = globalThis.fetch;
  const tracer = trace.getTracer("fetch");

  const newFetch = async (
    input: string | Request | URL,
    init?: BunFetchRequestInit,
  ) => {
    const oltpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT!;
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (url.toString().includes(oltpEndpoint)) {
      return originalFetch(input, init);
    }

    return tracer.startActiveSpan(
      `${request.method} ${url.hostname}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "http.request.method": request.method,
          "url.full": request.url,
          "server.address": url.hostname,
          "server.port": url.port || (url.protocol === "https:" ? 443 : 80),
          service_name: url.hostname,
        },
      },
      async (span) => {
        try {
          span.setAttributes(
            headerAttributes("http.request.header", request.headers),
          );

          const requestBody = await peekBody(request);
          if (requestBody !== undefined) {
            span.setAttribute("http.request.body", requestBody);
            span.setAttribute("http.request.body.size", requestBody.length);
          }

          const headers = new Headers(request.headers);
          propagation.inject(context.active(), headers, {
            set: (carrier, key, value) => carrier.set(key, value),
          });

          const response = await originalFetch(
            new Request(request, { headers }),
          );

          span.setAttribute("http.response.status_code", response.status);
          span.setAttributes(
            headerAttributes("http.response.header", response.headers),
          );
          span.setStatus({
            code: response.ok ? SpanStatusCode.OK : SpanStatusCode.ERROR,
          });

          const responseBody = await peekBody(response);
          if (responseBody !== undefined) {
            span.setAttribute("http.response.body", responseBody);
            span.setAttribute("http.response.body.size", responseBody.length);
          }

          return response;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  };

  newFetch.preconnect = (url: string | URL, options: PreconnectOptions) => {
    const span = tracer.startSpan(`PRECONNECT ${new URL(url).hostname}`, {
      kind: SpanKind.CLIENT,
      attributes: { "url.full": url.toString() },
    });
    try {
      originalFetch.preconnect(url, options);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  };
  globalThis.fetch = newFetch;
}
