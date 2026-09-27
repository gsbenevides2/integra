import safeEnvGet from "@server/safeEnvGet";

import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { NodeSSH } from "node-ssh";

const tracer = trace.getTracer("shared");

export async function runSshCommand(
  command: string,
  attributes: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string }> {
  return tracer.startActiveSpan(
    "ssh.exec",
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "server.address": process.env.SSH_DEFAULT_HOST ?? "",
        ...attributes,
      },
    },
    async (span) => {
      const ssh = new NodeSSH();
      try {
        await ssh.connect({
          host: safeEnvGet("SSH_DEFAULT_HOST"),
          port: Number(process.env.SSH_DEFAULT_PORT ?? "22"),
          username: safeEnvGet("SSH_DEFAULT_USERNAME"),
          privateKey: safeEnvGet("SSH_DEFAULT_PRIVATE_KEY"),
        });
        const result = await ssh.execCommand(command);
        if (result.code !== 0) {
          throw new Error(
            `SSH command exited with code ${result.code}: ${result.stderr}`,
          );
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return { stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        ssh.dispose();
        span.end();
      }
    },
  );
}
