import { afterEach, beforeAll, beforeEach, expect, mock, setSystemTime, test } from "bun:test";

let gaugeCb: (r: { observe: (n: number) => void }) => void;
let getCircuitBreakerState: typeof import("@server/modules/tplink/service/circuitBreaker").getCircuitBreakerState;
let recordError: typeof import("@server/modules/tplink/service/circuitBreaker").recordError;
let recordSuccess: typeof import("@server/modules/tplink/service/circuitBreaker").recordSuccess;
let reset: typeof import("@server/modules/tplink/service/circuitBreaker").reset;
let shouldThrottle: typeof import("@server/modules/tplink/service/circuitBreaker").shouldThrottle;

beforeAll(async () => {
  const real = { ...(await import("@server/instrumentation/metrics")) };
  mock.module("@server/instrumentation/metrics", () => ({
    ...real,
    meter: {
      createObservableGauge: () => ({ addCallback: (cb: typeof gaugeCb) => (gaugeCb = cb) }),
    },
  }));
  ({ getCircuitBreakerState, recordError, recordSuccess, reset, shouldThrottle } = await import("@server/modules/tplink/service/circuitBreaker?fresh" as string));
  mock.module("@server/instrumentation/metrics", () => real);
});

beforeEach(() => reset());
afterEach(() => setSystemTime());

test("opens after 3 errors, not before", () => {
  recordError("t", "x");
  recordError("t", "x");
  expect(shouldThrottle("t")).toBe(false);
  recordError("t", new Error("boom"));
  expect(shouldThrottle("t")).toBe(true);
  expect(getCircuitBreakerState("t").errorCount).toBe(3);
});

test("recovers after cooldown", () => {
  setSystemTime(new Date("2026-01-01T00:00:00Z"));
  for (let i = 0; i < 3; i++) recordError("t", "x");
  setSystemTime(new Date("2026-01-01T00:01:01Z"));
  expect(shouldThrottle("t")).toBe(false);
});

test("success clears state; triggers are independent", () => {
  for (let i = 0; i < 3; i++) recordError("a", "x");
  expect(shouldThrottle("b")).toBe(false);
  recordSuccess("a");
  expect(shouldThrottle("a")).toBe(false);
});

test("reset(id) clears one trigger; gauge counts open breakers", () => {
  for (let i = 0; i < 3; i++) recordError("a", "x");
  recordError("b", "x");
  let observed = -1;
  gaugeCb({ observe: (n) => (observed = n) });
  expect(observed).toBe(1);
  reset("a");
  expect(shouldThrottle("a")).toBe(false);
  expect(getCircuitBreakerState("b").errorCount).toBe(1);
});
