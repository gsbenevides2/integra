import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";

const realNodeSsh = { ...(await import("node-ssh")) };

const state = {
  disposed: 0,
  connectArgs: undefined as unknown,
  exec: { stdout: "out", stderr: "", code: 0 as number | null },
  sftpErr: null as Error | null,
  written: undefined as unknown[] | undefined,
};

class FakeSSH {
  async connect(a: unknown) {
    state.connectArgs = a;
  }
  async execCommand() {
    return state.exec;
  }
  async withSFTP(cb: (s: unknown) => Promise<void>) {
    await cb({
      writeFile: (p: string, d: Buffer, done: (e: Error | null) => void) => {
        state.written = [p, d];
        done(state.sftpErr);
      },
    });
  }
  dispose() {
    state.disposed++;
  }
}

mock.module("node-ssh", () => ({ NodeSSH: FakeSSH }));
const { runSshCommand, writeSshFile } = await import("@server/shared/ssh");

const keys = ["SSH_DEFAULT_HOST", "SSH_DEFAULT_USERNAME", "SSH_DEFAULT_PRIVATE_KEY", "SSH_DEFAULT_PORT"];
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of keys) saved[k] = process.env[k];
  process.env.SSH_DEFAULT_HOST = "h";
  process.env.SSH_DEFAULT_USERNAME = "u";
  process.env.SSH_DEFAULT_PRIVATE_KEY = "k";
  delete process.env.SSH_DEFAULT_PORT;
});
afterAll(() => {
  mock.module("node-ssh", () => realNodeSsh);
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
afterEach(() => {
  state.disposed = 0;
  state.exec = { stdout: "out", stderr: "", code: 0 };
  state.sftpErr = null;
});

test("runSshCommand returns stdout/stderr and disposes", async () => {
  expect(await runSshCommand("ls", { a: "b" })).toEqual({ stdout: "out", stderr: "" });
  expect((state.connectArgs as { port: number }).port).toBe(22);
  expect(state.disposed).toBe(1);
});

test("runSshCommand throws on non-zero and null exit code", async () => {
  process.env.SSH_DEFAULT_PORT = "2222";
  state.exec = { stdout: "", stderr: "e", code: 2 };
  await expect(runSshCommand("x")).rejects.toThrow("exited with code 2: e");
  expect((state.connectArgs as { port: number }).port).toBe(2222);
  state.exec = { stdout: "", stderr: "e", code: null };
  await expect(runSshCommand("x")).rejects.toThrow("code null");
  delete process.env.SSH_DEFAULT_PORT;
  expect(state.disposed).toBe(2);
});

test("writeSshFile writes via sftp, rejects on error", async () => {
  const data = Buffer.from("abc");
  await writeSshFile("/r/p", data);
  expect(state.written).toEqual(["/r/p", data]);
  state.sftpErr = new Error("sftp fail");
  await expect(writeSshFile("/r/p", data, { x: "y" })).rejects.toThrow("sftp fail");
  expect(state.disposed).toBe(2);
});
