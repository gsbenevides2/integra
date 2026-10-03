import { type Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { createRequire } from "node:module";

import { Gaxios, GaxiosOptions, GaxiosPromise, GaxiosResponse } from "gaxios";

import { recordSpanError } from "./withSpan";

function headerAttributes(prefix: string, headers: unknown) {
  const attributes: Record<string, string> = {};
  if (!headers) return attributes;
  const entries =
    typeof (headers as Headers).entries === "function"
      ? (headers as Headers).entries()
      : Object.entries(headers as Record<string, unknown>);
  for (const [key, value] of entries)
    attributes[`${prefix}.${key.toLowerCase()}`] = String(value);
  return attributes;
}

/** Strings and JSON-able objects only; streams/buffers/forms are skipped. */
function serializeBody(data: unknown): string | undefined {
  if (data === undefined || data === null || data === "") return undefined;
  if (typeof data === "string") return data;
  if (typeof data !== "object" || ArrayBuffer.isView(data)) return undefined;
  if (data instanceof ArrayBuffer || data instanceof Blob) return undefined;
  if (typeof (data as { pipe?: unknown }).pipe === "function") return undefined;
  if (data instanceof FormData || data instanceof URLSearchParams)
    return undefined;
  try {
    return JSON.stringify(data);
  } catch {
    return undefined;
  }
}

function recordBody(span: Span, prefix: string, data: unknown) {
  const text = serializeBody(data);
  if (text === undefined) return;
  span.setAttribute(`${prefix}.body`, text);
  span.setAttribute(`${prefix}.body.size`, Buffer.byteLength(text));
}

/** Whether we've already patched Gaxios.prototype.request to avoid double-wrap. */
let patched = false;

/**
 * Substitute `(Gaxios.prototype.request)` so that every HTTP call made
 * through `gaxios` (the transport used by `googleapis`) produces an
 * OpenTelemetry {@link SpanKind.CLIENT span} with URL, method, and
 * response status — exactly mirroring what {@code instrumentFetch} does
 * for {@code globalThis.fetch}-based calls.
 *
 * Call this <b>once</b> during server startup, after the tracer has been
 * initialised but before any googleapis client is created.
 */
export function instrumentGaxios(): void {
  if (patched) return;
  patched = true;

  const tracer = trace.getTracer("googleapis");
  // gaxios is a dual package: `googleapis` loads the CJS build while this
  // file's ESM import resolves to a different class, so patch both.
  const cjsGaxios = createRequire(import.meta.url)("gaxios")
    .Gaxios as typeof Gaxios;
  for (const cls of new Set([Gaxios, cjsGaxios])) patch(cls);

  function patch(cls: typeof Gaxios) {
    const original = cls.prototype.request;

    // Gaxios.prototype.request<T>(opts?: GaxiosOptions): GaxiosPromise<T>
    cls.prototype.request = function request(
      this: Gaxios,
      opts: GaxiosOptions = {},
    ): GaxiosPromise<unknown> {
      const method = (opts.method ?? "GET").toUpperCase();
      let rawUrl = opts.url?.toString() ?? "unknown";
      let hostname = "unknown";
      try {
        const parsed = new URL(rawUrl);
        hostname = parsed.hostname;
        // googleapis sends query params via `opts.params`, not in the URL.
        for (const [k, v] of Object.entries(opts.params ?? {})) {
          for (const item of Array.isArray(v) ? v : [v]) {
            if (item != null) parsed.searchParams.append(k, String(item));
          }
        }
        rawUrl = parsed.toString();
      } catch {
        // use the default fallback
      }

      return tracer.startActiveSpan(
        `${method} ${hostname}`,
        {
          kind: SpanKind.CLIENT,
          attributes: {
            "http.request.method": method,
            "url.full": rawUrl,
            "server.address": hostname,
            service_name: hostname,
            "peer.service": "google-api",
          },
        },
        async (span) => {
          try {
            span.setAttributes(
              headerAttributes("http.request.header", opts.headers),
            );
            recordBody(span, "http.request", opts.data ?? opts.body);

            const result = await original.call(this, opts);

            span.setAttribute("http.response.status_code", result.status);
            span.setAttributes(
              headerAttributes("http.response.header", result.headers),
            );
            recordBody(span, "http.response", result.data);
            if (!result.ok) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: `HTTP ${result.status}`,
              });
            }

            return result;
          } catch (error: unknown) {
            // GaxiosError carries the response for non-2xx statuses.
            const response = (error as { response?: GaxiosResponse }).response;
            if (response) {
              span.setAttribute("http.response.status_code", response.status);
              span.setAttributes(
                headerAttributes("http.response.header", response.headers),
              );
              recordBody(span, "http.response", response.data);
            }
            recordSpanError(span, error);
            throw error;
          } finally {
            span.end();
          }
        },
      ) as GaxiosPromise<unknown>;
    } as typeof cls.prototype.request;
  }
}
