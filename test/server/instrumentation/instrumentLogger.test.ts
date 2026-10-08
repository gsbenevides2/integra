import {
  getLogger,
  logError,
  logInfo,
  logWarn,
  setupLoggerProvider,
  SeverityNumber,
} from "@server/instrumentation/instrumentLogger";

import { expect, spyOn, test } from "bun:test";

function fakeLogger() {
  const records: Record<string, unknown>[] = [];
  return {
    records,
    logger: { emit: (r: Record<string, unknown>) => records.push(r) } as never,
  };
}

test("logError with Error attaches type/message/stack", () => {
  const { logger, records } = fakeLogger();
  const spy = spyOn(console, "error").mockImplementation(() => {});
  logError(logger, "msg", new RangeError("bad"), { a: 1 });
  const attrs = records[0]!.attributes as Record<string, unknown>;
  expect(records[0]!.severityNumber).toBe(SeverityNumber.ERROR);
  expect(attrs["error.type"]).toBe("RangeError");
  expect(attrs["error.message"]).toBe("bad");
  expect(attrs["error.stack"]).toBeString();
  expect(attrs.a).toBe(1);
  spy.mockRestore();
});

test("logError with Error lacking stack, non-Error and undefined", () => {
  const { logger, records } = fakeLogger();
  const spy = spyOn(console, "error").mockImplementation(() => {});
  const e = new Error("x");
  e.stack = "";
  logError(logger, "m", e);
  expect((records[0]!.attributes as object) as Record<string, unknown>).not.toHaveProperty("error.stack");
  logError(logger, "m", "plain");
  expect((records[1]!.attributes as Record<string, unknown>)["error.message"]).toBe("plain");
  logError(logger, "m");
  expect(records[2]!.attributes).toEqual({});
  spy.mockRestore();
});

test("logInfo and logWarn emit and print", () => {
  const { logger, records } = fakeLogger();
  const log = spyOn(console, "log").mockImplementation(() => {});
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  logInfo(logger, "i", { k: "v" });
  logInfo(logger, "i2");
  logWarn(logger, "w", { k: 1 });
  logWarn(logger, "w2");
  expect(records.map((r) => r.severityNumber)).toEqual([
    SeverityNumber.INFO,
    SeverityNumber.INFO,
    SeverityNumber.WARN,
    SeverityNumber.WARN,
  ]);
  expect(log).toHaveBeenCalledWith("i2", "");
  expect(warn).toHaveBeenCalledWith("w2", "");
  log.mockRestore();
  warn.mockRestore();
});

test("setupLoggerProvider is idempotent and getLogger returns a logger", () => {
  setupLoggerProvider();
  setupLoggerProvider();
  expect(typeof getLogger("t").emit).toBe("function");
});
