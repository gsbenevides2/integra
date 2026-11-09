import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

import { startProduction } from "../../scripts/start-production";

interface MockProcess {
  exitCode: number;
  killed: boolean;
}

function mockProcess(exitCode: number): MockProcess & Promise<MockProcess> {
  const proc = { exitCode, killed: false };
  return Object.assign(proc, Promise.resolve(proc)) as MockProcess & Promise<MockProcess>;
}

const originalExit = process.exit;
const originalError = console.error;
const logged: string[] = [];
let exitCodeCalled: number | undefined;

beforeAll(() => {
  process.exit = ((code?: number) => {
    exitCodeCalled = code ?? 0;
    throw new Error("process.exit called");
  }) as (code?: number) => never;
  console.error = (...args: unknown[]) => {
    logged.push(args.join(" "));
  };
});

afterAll(() => {
  process.exit = originalExit;
  console.error = originalError;
});

afterEach(() => {
  logged.length = 0;
  exitCodeCalled = undefined;
});

test("runs migration and spawns the server on success", async () => {
  const proc = mockProcess(0);

  await expect(
    startProduction(
      async () => ({ exitCode: 0 }),
      () => proc,
    ),
  ).rejects.toThrow("process.exit called");

  expect(logged).toContain("[startup] Running database schema sync...");
  expect(logged).toContain("[startup] Database schema sync completed.");
  expect(proc.killed).toBe(false);
});

test("logs migration failure but still spawns the server", async () => {
  const proc = mockProcess(0);

  await expect(
    startProduction(
      async () => ({
        exitCode: 1,
        stderr: Buffer.from("connection refused"),
        stdout: Buffer.from(""),
      }),
      () => proc,
    ),
  ).rejects.toThrow("process.exit called");

  expect(logged).toContain("[startup] Running database schema sync...");
  expect(logged).toContain(
    "[startup] Database schema sync failed (non-fatal), continuing...",
  );
  expect(logged).toContain("[startup]   connection refused");
});

test("logs migration failure with multiline output", async () => {
  const proc = mockProcess(0);

  await expect(
    startProduction(
      async () => ({
        exitCode: 1,
        stderr: Buffer.from("line 1\nline 2\n"),
        stdout: Buffer.from(""),
      }),
      () => proc,
    ),
  ).rejects.toThrow("process.exit called");

  expect(logged).toContain("[startup]   line 1");
  expect(logged).toContain("[startup]   line 2");
});

test("calls process.exit with the server exit code", async () => {
  const proc = mockProcess(42);

  await expect(
    startProduction(
      async () => ({ exitCode: 0 }),
      () => proc,
    ),
  ).rejects.toThrow("process.exit called");

  expect(exitCodeCalled).toBe(42);
});