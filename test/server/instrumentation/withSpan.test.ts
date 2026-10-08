import { recordSpanError, withSpan } from "@server/instrumentation/withSpan";

import { SpanKind, SpanStatusCode, type Tracer } from "@opentelemetry/api";
import { expect, test } from "bun:test";

function fakeSpan() {
  const s = {
    ended: false,
    exceptions: [] as Error[],
    attrs: {} as Record<string, unknown>,
    status: undefined as unknown,
    recordException(e: Error) {
      s.exceptions.push(e);
    },
    setAttribute(k: string, v: unknown) {
      s.attrs[k] = v;
    },
    setStatus(v: unknown) {
      s.status = v;
    },
    end() {
      s.ended = true;
    },
  };
  return s;
}
function fakeTracer(span: ReturnType<typeof fakeSpan>) {
  const calls: unknown[][] = [];
  const tracer = {
    startActiveSpan: (...args: unknown[]) => {
      calls.push(args);
      return (args[2] as (s: unknown) => unknown)(span);
    },
  } as unknown as Tracer;
  return { tracer, calls };
}

test("withSpan returns value, ends span, defaults to INTERNAL", async () => {
  const span = fakeSpan();
  const { tracer, calls } = fakeTracer(span);
  expect(await withSpan(tracer, "n", {}, async () => 5)).toBe(5);
  expect(span.ended).toBe(true);
  expect(span.status).toBeUndefined();
  expect((calls[0]![1] as { kind: SpanKind }).kind).toBe(SpanKind.INTERNAL);
});

test("withSpan records error and rethrows", async () => {
  const span = fakeSpan();
  const { tracer } = fakeTracer(span);
  await expect(
    withSpan(tracer, "n", { kind: SpanKind.CLIENT }, async () => {
      throw new TypeError("boom");
    }),
  ).rejects.toThrow("boom");
  expect(span.ended).toBe(true);
  expect(span.attrs["error.type"]).toBe("TypeError");
  expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: "boom" });
});

test("recordSpanError wraps non-Error values", () => {
  const span = fakeSpan();
  recordSpanError(span as never, "str");
  expect(span.exceptions[0]!.message).toBe("str");
  expect(span.attrs["error.type"]).toBe("Error");
});
