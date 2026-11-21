import {
  getRumSessionId,
  instrumentFrontend,
  reportError,
} from "@public/instrumentFrontend";

import { openobserveLogs } from "@openobserve/browser-logs";
import { openobserveRum } from "@openobserve/browser-rum";
import { context, propagation, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";
import { afterAll, expect, spyOn, test } from "bun:test";

// The OTLP span exporter would otherwise flush over the (absent) network.
spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
const RUM = { clientToken: "t", site: "s.example.com", organization: "org", env: "production" };
spyOn(OTLPTraceExporter.prototype, "export").mockImplementation((_s, cb) => cb({ code: 0 }));

const spies: { mockRestore(): void }[] = [];
afterAll(() => spies.forEach((s) => s.mockRestore()));

test("getRumSessionId returns id, undefined when absent or throwing", () => {
  const ctx = spyOn(openobserveRum, "getInternalContext");
  spies.push(ctx);
  ctx.mockReturnValue({ session_id: "abc" } as any);
  expect(getRumSessionId()).toBe("abc");
  ctx.mockReturnValue(undefined as any);
  expect(getRumSessionId()).toBeUndefined();
  ctx.mockImplementation(() => {
    throw new Error("x");
  });
  expect(getRumSessionId()).toBeUndefined();
});

test("instrumentFrontend wires RUM, logs, tracing and error capture", async () => {
  const rumInit = spyOn(openobserveRum, "init").mockImplementation(() => {});
  const logsInit = spyOn(openobserveLogs, "init").mockImplementation(() => {});
  const replay = spyOn(openobserveRum, "startSessionReplayRecording").mockImplementation(() => {});
  const ctx = spyOn(openobserveRum, "getInternalContext");
  ctx.mockReturnValue({ session_id: "sid" } as any);
  spies.push(rumInit, logsInit, replay, ctx);

  const setConfig = spyOn(UserInteractionInstrumentation.prototype, "setConfig");
  spies.push(setConfig);
  // Server tests in the same process may have registered global OTel providers;
  // register() would silently keep them instead of ours.
  trace.disable();
  context.disable();
  propagation.disable();
  fetchSpy.mockResolvedValueOnce(Response.json({ version: "1", rum: RUM }));
  await instrumentFrontend();
  const uiConfig = setConfig.mock.calls[0]![0] as any;
  const attrs: Record<string, string> = {};
  uiConfig.shouldPreventSpanCreation("click", document.createElement("b"), {
    setAttribute: (k: string, v: string) => (attrs[k] = v),
  });
  expect(attrs["target.label"]).toBe("");
  expect(logsInit).toHaveBeenCalled();
  expect(replay).toHaveBeenCalled();
  const cfg = rumInit.mock.calls[0]![0] as any;
  expect(cfg.service).toBe("integra-web");
  expect(cfg.clientToken).toBe("t");
  expect(cfg.organizationIdentifier).toBe("org");

  // beforeSend drops static assets and our own trace exporter, keeps the rest
  const res = (type: string, url = "/x") => ({ type: "resource", resource: { type, url } });
  expect(cfg.beforeSend(res("js"))).toBe(false);
  expect(cfg.beforeSend(res("xhr", "/v1/traces"))).toBe(false);
  expect(cfg.beforeSend(res("xhr", "/api/a"))).toBe(true);
  expect(cfg.beforeSend({ type: "view" })).toBe(true);

  // spans get session.id (sid present, then absent)
  const tracer = trace.getTracer("t");
  const span = tracer.startSpan("s");
  span.end();
  ctx.mockReturnValue(undefined as any);
  tracer.startSpan("s2").end();

  // uncaught errors become spans (Error, message fallback, rejection)
  window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom") }));
  window.dispatchEvent(new ErrorEvent("error", { message: "just a message" }));
  const rej = new Event("unhandledrejection") as any;
  rej.reason = "why";
  window.dispatchEvent(rej);

  // the custom processor's flush/shutdown are no-ops that resolve
  const processors = (trace.getTracerProvider() as any).getDelegate()._activeSpanProcessor._spanProcessors;
  await processors[0].forceFlush();
  await processors[0].shutdown();
});

test("reportError reports a handled error to RUM with its trace id", () => {
  const addError = spyOn(openobserveRum, "addError").mockImplementation(() => {});
  const ctx = spyOn(openobserveRum, "getInternalContext").mockReturnValue({
    session_id: "sess-2",
  } as any);
  spies.push(addError, ctx);

  const ids = reportError("react.error_boundary", new Error("boom"), {
    component_stack: "at Boom",
  });

  expect(ids.sessionId).toBe("sess-2");
  expect(ids.traceId).toMatch(/^[0-9a-f]{32}$/);
  expect(addError).toHaveBeenCalledWith(expect.any(Error), {
    component_stack: "at Boom",
    trace_id: ids.traceId,
  });

  // Anything thrown that is not an Error is stringified, and a report with no
  // context still carries the trace of its own span.
  reportError("manual.report", "sem stack");
  const [thrown, context] = addError.mock.calls.at(-1) as [
    unknown,
    Record<string, string>,
  ];
  expect(thrown).toBe("sem stack");
  expect(Object.keys(context)).toEqual(["trace_id"]);
  expect(context.trace_id).toMatch(/^[0-9a-f]{32}$/);
});

test("reportError falls back to the console when telemetry is down", () => {
  // No RUM session and no provider: nothing would be recorded anywhere, so the
  // error (and the component stack) has to reach the console — `createRoot`
  // keeps React's own console.error quiet, precisely to avoid reporting twice
  // when telemetry *is* there.
  const ctx = spyOn(openobserveRum, "getInternalContext").mockReturnValue(
    undefined as any,
  );
  const consoleError = spyOn(console, "error").mockImplementation(() => {});
  spies.push(ctx, consoleError);
  trace.disable();

  const ids = reportError("react.error_boundary", new Error("boom"), {
    component_stack: "at Boom",
  });

  expect(ids).toEqual({ sessionId: undefined, traceId: undefined });
  expect(consoleError).toHaveBeenCalledWith(
    "react.error_boundary",
    expect.any(Error),
    "at Boom",
  );
  consoleError.mockClear();

  // Without a component stack the third argument is still there, empty.
  reportError("manual.report", "sem stack");
  expect(consoleError).toHaveBeenCalledWith("manual.report", "sem stack", "");
});

test("instrumentFrontend does nothing without RUM config", async () => {
  const rumInit = spyOn(openobserveRum, "init").mockImplementation(() => {});
  spies.push(rumInit);
  rumInit.mockClear();
  fetchSpy.mockResolvedValueOnce(Response.json({ version: "1", rum: null }));
  await instrumentFrontend();
  fetchSpy.mockRejectedValueOnce(new Error("offline"));
  await instrumentFrontend();
  fetchSpy.mockResolvedValueOnce(new Response("no", { status: 500 }));
  await instrumentFrontend();
  expect(rumInit).not.toHaveBeenCalled();
});
