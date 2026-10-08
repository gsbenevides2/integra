import safeEnvGet from "@server/safeEnvGet";

export async function sendEvolutionMessage(text: string): Promise<void> {
  const url = new URL("/send/text", safeEnvGet("EVOLUTION_ENDPOINT"));
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      apikey: safeEnvGet("EVOLUTION_API_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: "default",
      delay: 123,
      number: safeEnvGet("PERSONAL_WHATSAPP_NUMBER"),
      text,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Evolution message failed: ${response.status} ${await response.text()}`,
    );
  }
}
