import safeEnvGet from "@server/safeEnvGet";

export async function sendGotifyMessage(message: string): Promise<void> {
  const url = new URL("/message", safeEnvGet("GOTIFY_URL"));
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "X-Gotify-Key": safeEnvGet("GOTIFY_TOKEN"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Integra", message, priority: 5 }),
  });
  if (!response.ok) {
    throw new Error(
      `Gotify message failed: ${response.status} ${await response.text()}`,
    );
  }
}
