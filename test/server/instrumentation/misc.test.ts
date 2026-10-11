import * as metricsMod from "@server/instrumentation/metrics";
import { appResource, SERVICE_NAME } from "@server/instrumentation/resource";
import { flushTelemetry, flushTelemetryOnExit } from "@server/instrumentation/shutdown";

import { metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";

test("resource has service identity", () => {
  expect(SERVICE_NAME).toBeString();
  expect(appResource.attributes["service.name"]).toBe(SERVICE_NAME);
});

test("metrics instruments exist and accept data", () => {
  for (const k of [
    "cronRuns",
    "cacheRequests",
    "pulsarEvents",
  ] as const) {
    expect(() => metricsMod[k].add(1)).not.toThrow();
  }
  expect(() => metricsMod.cronDuration.record(1)).not.toThrow();
  expect(() => metricsMod.httpClientDuration.record(1)).not.toThrow();
  expect(() => metricsMod.dbDuration.record(1)).not.toThrow();
  expect(metricsMod.meter).toBeDefined();
});

// Other test files register real OTLP providers globally; flushing those hits
// the network, so stub the providers to keep these tests order-independent.
const forceFlush = mock(async () => {});
let providerSpies: ReturnType<typeof spyOn>[] = [];
beforeEach(() => {
  forceFlush.mockClear();
  providerSpies = [
    // A proxy provider that delegates to the real one...
    spyOn(trace, "getTracerProvider").mockReturnValue({
      getDelegate: () => ({ forceFlush }),
    } as never),
    // ...and plain providers, with and without forceFlush.
    spyOn(logs, "getLoggerProvider").mockReturnValue({ forceFlush } as never),
    spyOn(metrics, "getMeterProvider").mockReturnValue({} as never),
  ];
});

let onceSpy: ReturnType<typeof spyOn>;
afterEach(() => {
  onceSpy?.mockRestore();
  providerSpies.forEach((spy) => spy.mockRestore());
});

test("flushTelemetry flushes delegated and plain providers", async () => {
  await flushTelemetry();
  expect(forceFlush).toHaveBeenCalledTimes(2);
});

test("flushTelemetryOnExit registers SIGTERM/SIGINT and flushes then exits", async () => {
  const handlers: Record<string, () => void> = {};
  onceSpy = spyOn(process, "once").mockImplementation(((
    sig: string,
    cb: () => void,
  ) => {
    handlers[sig] = cb;
    return process;
  }) as never);
  const exit = spyOn(process, "exit").mockImplementation((() => {}) as never);
  flushTelemetryOnExit();
  expect(Object.keys(handlers).sort()).toEqual(["SIGINT", "SIGTERM"]);
  handlers.SIGTERM!();
  await new Promise((r) => setTimeout(r, 10));
  expect(exit).toHaveBeenCalledWith(0);
  exit.mockRestore();
});
