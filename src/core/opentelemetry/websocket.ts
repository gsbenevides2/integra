/**
 * WebSocket tracing for Bun's native WebSocket server.
 *
 * Wraps event handlers so each incoming message produces a child span
 * linked to the active trace context.
 */
import { type Span, type Tracer } from "@opentelemetry/api";
import { getTracer } from "./tracer";

/**
 * Options for creating a traced WebSocket handler.
 */
export interface TracedWsOptions {
  /** OpenTelemetry tracer (defaults to global). */
  tracer?: Tracer;
  /** Label for the ws connection (e.g. dashboard, tuya, internal). */
  protocol?: string;
}

/**
 * Create a wrapper around a WebSocket message handler that traces
 * every incoming message with a child span.
 *
 * Usage:
 * ```ts
 * const tracedHandler = createTracedWsHandler(handler, { protocol: "dashboard" });
 * Bun.serve({
 *   fetch(req, server) {
 *     if (server.upgrade(req)) return;
 *   },
 *   websocket: { message: tracedHandler },
 * });
 * ```
 */
export function createTracedWsHandler(
  handler: (ws: import("bun").ServerWebSocket<unknown>, data: string | Buffer) => void | Promise<void>,
  opts: TracedWsOptions = {},
): (ws: import("bun").ServerWebSocket<unknown>, data: string | Buffer) => void | Promise<void> {
  const otel = opts.tracer ?? getTracer();
  const protocol = opts.protocol ?? "ws";

  return async (ws, data) => {
    const payload = typeof data === "string" ? data : data.toString();
    let parsedType = protocol;
    try {
      const parsed = JSON.parse(payload);
      if (parsed.type) parsedType = `${protocol}.${parsed.type}`;
    } catch { /* keep default */ }

    await otel.startActiveSpan(
      `ws.recv ${parsedType}`,
      {
        kind: 1, // SERVER
        attributes: {
          "messaging.system": "websocket",
          "messaging.operation": "receive",
          "messaging.message.type": parsedType,
          "messaging.message.body.length": payload.length,
        },
      },
      async (span: Span) => {
        try {
          await handler(ws, data);
          span.setStatus({ code: 1 });
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

/**
 * Wraps the outgoing ws.send() to create a producer span.
 */
export function createTracedWsSend(
  ws: import("bun").ServerWebSocket<unknown>,
  tracer?: Tracer,
): (data: string | Buffer) => void {
  const otel = tracer ?? getTracer();
  return (data) => {
    const payload = typeof data === "string" ? data : data.toString();
    const span = otel.startSpan("ws.send", {
      kind: 3, // CLIENT (from server perspective)
      attributes: {
        "messaging.system": "websocket",
        "messaging.operation": "send",
        "messaging.message.body.length": payload.length,
      },
    });
    try {
      ws.send(data);
      span.setStatus({ code: 1 });
    } catch (err) {
      span.setStatus({ code: 2, message: String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  };
}