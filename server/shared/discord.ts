import safeEnvGet from "@server/safeEnvGet";

// The old repo's public-key env var is, despite the name, the Discord bot token itself
// (Authorization: Bot <value>) — kept as-is since it's already provisioned that way.
const DISCORD_CHANNEL_ID = "1444824842225582252";

export async function sendDiscordMessage(content: string): Promise<void> {
  const response = await fetch(
    `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${safeEnvGet("DISCORD_DEFAULT_PUBLIC_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Discord message failed: ${response.status} ${await response.text()}`,
    );
  }
}
