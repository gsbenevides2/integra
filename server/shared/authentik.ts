import safeEnvGet from "@server/safeEnvGet";

import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

import { redisGet, redisSet } from "./cache";

const tracer = trace.getTracer("shared");

function decodeJwtExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const decoded = JSON.parse(json) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

async function getCachedToken(clientId: string): Promise<string | null> {
  const cached = await redisGet(`authentik-login:${clientId}`);
  if (!cached) return null;
  const exp = decodeJwtExpiry(cached);
  if (exp === null || exp < Math.floor(Date.now() / 1000)) return null;
  return cached;
}

/**
 * Client-credentials login against Authentik, caching the returned JWT in Redis
 * until it's within its own expiry (see decodeJwtExpiry) so repeated calls for
 * the same clientId don't re-authenticate every time.
 */
export async function loginInAuthentik(
  clientId: string,
): Promise<{ access_token: string }> {
  const cached = await getCachedToken(clientId);
  if (cached) return { access_token: cached };

  return tracer.startActiveSpan(
    "authentik.login",
    { kind: SpanKind.CLIENT, attributes: { "authentik.client_id": clientId } },
    async (span) => {
      try {
        const body = new URLSearchParams({
          client_id: clientId,
          grant_type: "client_credentials",
          scope: "profile",
          client_secret: btoa(
            `${safeEnvGet("AUTHENTIK_USERNAME")}:${safeEnvGet("AUTHENTIK_PASSWORD")}`,
          ),
        });
        const tokenUrl = new URL(
          "/application/o/token/",
          safeEnvGet("AUTHENTIK_URL"),
        ).toString();
        const response = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (!response.ok) {
          throw new Error(`Failed to get token: ${response.statusText}`);
        }
        const json = (await response.json()) as { access_token: string };
        await redisSet(`authentik-login:${clientId}`, json.access_token);
        span.setStatus({ code: SpanStatusCode.OK });
        return json;
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
