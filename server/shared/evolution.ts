import safeEnvGet from "@server/safeEnvGet";

export async function sendEvolutionMessage(text: string): Promise<void> {
  const url = new URL(
    "/message/sendText/default",
    safeEnvGet("EVOLUTION_ENDPOINT"),
  );
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      apikey: safeEnvGet("EVOLUTION_API_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      number: safeEnvGet("PERSONAL_WHATSAPP_NUMBER"),
      textMessage: { text },
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Evolution message failed: ${response.status} ${await response.text()}`,
    );
  }
}
