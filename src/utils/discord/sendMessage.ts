import { instumentableFetch } from "instrumentation";
import safeEnvGet from "utils/safeEnvGet";

export default async function sendDiscordMessage(message: string, traceId: string) {
    const public_key = safeEnvGet("DISCORD_DEFAULT_PUBLIC_KEY");
    const channelId = "1444824842225582252";
    const payload = {
        content: message,
    };
    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
    const headers = {
        Authorization: `Bot ${public_key}`,
        "Content-Type": "application/json",
    };
    const response = await instumentableFetch(traceId, url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
    });

    return await response.json();
}
