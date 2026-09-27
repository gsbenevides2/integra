import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("google");

async function traced<T>(
  name: string,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    {
      kind: SpanKind.CLIENT,
      attributes: { "s3.bucket": process.env.S3_BUCKET ?? "", "s3.key": key },
    },
    async (span) => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export function uploadTemp(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<number> {
  return traced("s3.upload", key, () =>
    Bun.s3.write(key, data, { type: contentType }),
  );
}

// Synchronous, local URL signing — no network call, so no span for it.
export function presignedUrl(key: string, expiresIn = 3600): string {
  return Bun.s3.presign(key, { expiresIn });
}

export function deleteTemp(key: string): Promise<void> {
  return traced("s3.delete", key, () => Bun.s3.delete(key));
}
