import { sendDiscordMessage } from "@server/shared/discord";

import { getEventsOfToday } from "../service/events";
import { buildBirthdayMessage } from "../service/message";

export async function sendBirthdayMessage(): Promise<void> {
  const rawText = await getEventsOfToday();
  await sendDiscordMessage(buildBirthdayMessage(rawText));
}
