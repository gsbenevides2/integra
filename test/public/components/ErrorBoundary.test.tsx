import React from "react";

import {
  CRASH_COPIED_LABEL,
  CRASH_COPY_LABEL,
  CRASH_DESCRIPTION,
  CRASH_RELOAD_LABEL,
  CRASH_SESSION_LABEL,
  CRASH_TITLE,
  ErrorBoundary,
} from "@public/components/ErrorBoundary";
import { reportError } from "@public/instrumentFrontend";

import { openobserveRum } from "@openobserve/browser-rum";
import { trace } from "@opentelemetry/api";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, expect, spyOn, test } from "bun:test";

// React logs every error a boundary catches (`onCaughtError`); the boundary
// reports it itself, so the noise (and the OTel duplicate-registration error)
// is silenced here.
const consoleError = spyOn(console, "error").mockImplementation(() => {});
const addError = spyOn(openobserveRum, "addError").mockImplementation(() => {});
const internalContext = spyOn(
  openobserveRum,
  "getInternalContext",
).mockReturnValue({ session_id: "sess-boundary" } as any);
afterAll(() => {
  consoleError.mockRestore();
  addError.mockRestore();
  internalContext.mockRestore();
  // Leave the global tracer registry to the next test file.
  trace.disable();
});
afterEach(cleanup);

function Boom(): React.JSX.Element {
  throw new Error("explodiu no render");
}

function Fine(): React.JSX.Element {
  return <span>tudo certo</span>;
}

test("a render error becomes the crash screen with its OpenObserve ids", () => {
  // reportError only has a trace id to show while a provider is registered.
  new WebTracerProvider().register();
  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );

  expect(screen.getByText(CRASH_TITLE)).toBeTruthy();
  expect(screen.getByText(CRASH_DESCRIPTION)).toBeTruthy();
  expect(screen.getByText("explodiu no render")).toBeTruthy();
  expect(screen.getByText(`${CRASH_SESSION_LABEL}:`)).toBeTruthy();
  expect(screen.getByText("sess-boundary")).toBeTruthy();

  // The RUM error carries the component stack and the trace of the error span,
  // and the screen shows that very trace id.
  const [error, context] = addError.mock.calls.at(-1) as [
    Error,
    Record<string, string>,
  ];
  expect(error.message).toBe("explodiu no render");
  expect(context.component_stack).toContain("Boom");
  expect(context.trace_id).toMatch(/^[0-9a-f]{32}$/);
  expect(screen.getByText(context.trace_id!)).toBeTruthy();
});

test("children render while nothing fails, non-Error throws show as thrown", () => {
  const { unmount } = render(
    <ErrorBoundary>
      <Fine />
    </ErrorBoundary>,
  );
  expect(screen.getByText("tudo certo")).toBeTruthy();
  unmount();

  function ThrowsString(): React.JSX.Element {
    throw "sem stack";
  }
  render(
    <ErrorBoundary>
      <ThrowsString />
    </ErrorBoundary>,
  );
  expect(screen.getByText("sem stack")).toBeTruthy();
});

test("a new resetKey drops the failure without a reload", () => {
  const { rerender } = render(
    <ErrorBoundary resetKey="tuya">
      <Boom />
    </ErrorBoundary>,
  );
  expect(screen.getByText(CRASH_TITLE)).toBeTruthy();

  rerender(
    <ErrorBoundary resetKey="crons">
      <Fine />
    </ErrorBoundary>,
  );
  expect(screen.getByText("tudo certo")).toBeTruthy();
  expect(screen.queryByText(CRASH_TITLE)).toBeNull();
});

test("buttons copy the identifiers and reload the page", () => {
  const writeText = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const reload = spyOn(window.location, "reload").mockImplementation(() => {});

  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );
  fireEvent.click(screen.getByText(CRASH_COPY_LABEL));
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining("sess-boundary"),
  );
  expect(screen.getByText(CRASH_COPIED_LABEL)).toBeTruthy();

  fireEvent.click(screen.getByText(CRASH_RELOAD_LABEL));
  expect(reload).toHaveBeenCalled();

  writeText.mockRestore();
  reload.mockRestore();
});

test("a refused clipboard still confirms the copy", () => {
  const writeText = spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("permission denied"),
  );
  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );
  fireEvent.click(screen.getByText(CRASH_COPY_LABEL));
  expect(screen.getByText(CRASH_COPIED_LABEL)).toBeTruthy();
  writeText.mockRestore();
});

test("a failing telemetry call still shows the crash screen", () => {
  addError.mockImplementation(() => {
    throw new Error("RUM sem init");
  });

  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );

  // The boundary is the last resort: a throw from componentDidCatch would take
  // the tree down again and leave exactly the blank screen it exists to avoid.
  expect(screen.getByText(CRASH_TITLE)).toBeTruthy();
  expect(screen.getByText("explodiu no render")).toBeTruthy();
  addError.mockImplementation(() => {});
});

test("a report with no context still reaches RUM", () => {
  addError.mockClear();

  const ids = reportError("manual.report", "sem trace");
  const [thrown, context] = addError.mock.calls.at(-1) as [
    unknown,
    Record<string, string>,
  ];

  expect(ids.sessionId).toBe("sess-boundary");
  expect(thrown).toBe("sem trace");
  // The trace id is whatever the process has: absent when no provider is
  // registered, and then the RUM error does not carry a trace_id at all.
  expect(Object.keys(context)).toEqual(ids.traceId ? ["trace_id"] : []);
});
