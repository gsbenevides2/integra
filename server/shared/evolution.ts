import safeEnvGet from "@server/safeEnvGet";

async function getInstanceToken() {
  const url = new URL("/instance/all", safeEnvGet("EVOLUTION_ENDPOINT"));
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: safeEnvGet("EVOLUTION_API_KEY"),
      "Content-Type": "application/json",
    },
  });
  const { data } = (await response.json()) as { data: { token: string }[] };
  return data.at(0)?.token;
}

export async function sendEvolutionMessage(text: string): Promise<void> {
  const token = await getInstanceToken();
  if (!token) throw new Error("Missing Token");
  const url = new URL("/send/text", safeEnvGet("EVOLUTION_ENDPOINT"));
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      apikey: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
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
