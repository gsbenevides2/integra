import {
  getCurrentSpan,
  opentelemetry,
  setAttributes,
} from "@elysia/opentelemetry";
import { SpanStatusCode } from "@opentelemetry/api";
import { parseKeyPairsIntoRecord } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { Elysia } from "elysia";

export const elysiaOtel = new Elysia({
  detail: {
    tags: ["FrontEnd Tracing"],
  },
})
  .use(
    opentelemetry({
      spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
      // Capture Request Body and Request Headers and Sent to OTEL
      recordBody: true,
      headersToSpanAttributes: { request: ["*"] },
      checkIfShouldTrace: (req) => new URL(req.url).pathname !== "/v1/traces",
    }),
  )
  // Capture Response Body and Response Headers and Send to OTEL
  .onAfterHandle(({ responseValue, set }) => {
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(set.headers))
      attributes[`http.response.header.${key.toLowerCase()}`] = String(value);
    if (responseValue !== undefined && !(responseValue instanceof Response)) {
      const text =
        typeof responseValue === "object"
          ? JSON.stringify(responseValue)
          : String(responseValue);
      attributes["http.response.body"] = text;
      attributes["http.response.body.size"] = String(text.length);
    }
    if (Object.keys(attributes).length) setAttributes(attributes);
    getCurrentSpan()?.setStatus({ code: SpanStatusCode.OK });
  })
  .onError(({ error }) => {
    getCurrentSpan()?.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
  })
  // Proxy frontend spans to the real collector so its auth header never
  // reaches the browser bundle.
  .post(
    "/v1/traces",
    async ({ request, body }) => {
      const authHeaders = parseKeyPairsIntoRecord(
        process.env.OTEL_EXPORTER_OTLP_HEADERS,
      );
      const response = await fetch(
        `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
        {
          method: "POST",
          headers: {
            "content-type":
              request.headers.get("content-type") ?? "application/x-protobuf",
            ...authHeaders,
          },
          body: body as ArrayBuffer,
        },
      );
      return new Response(null, { status: response.status });
    },
    {
      detail: {
        summary: "Proxy Frontend Traces",
        description:
          "Forwards OTLP trace spans emitted by the frontend to the real " +
          "collector, so the collector's auth header never reaches the " +
          "browser bundle.",
      },
      parse: "arrayBuffer",
    },
  );
