import { instrumentableFetch } from "core/instrumentation";
import safeEnvGet from "utils/safeEnvGet";

export const DISCORD_CHANNEL_ID = "1444824842225582252";
export const DISCORD_PUBLIC_KEY = safeEnvGet("DISCORD_DEFAULT_PUBLIC_KEY");

export default async function sendDiscordMessage(message: string, traceId: string) {
    const payload = {
        content: message,
    };
    const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`;
    const headers = {
        Authorization: `Bot ${DISCORD_PUBLIC_KEY}`,
        "Content-Type": "application/json",
    };
    const response = await instrumentableFetch(traceId, url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
    });

    return await response.json();
}
