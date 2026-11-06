import { getRumSessionId, instrumentFrontend } from "@public/instrumentFrontend";

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
