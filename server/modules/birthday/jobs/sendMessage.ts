import { sendDiscordMessage } from "@server/shared/discord";
import { sendEvolutionMessage } from "@server/shared/evolution";

import { getEventsOfToday } from "../service/events";
import { buildBirthdayMessage } from "../service/message";

export async function sendBirthdayMessage(): Promise<void> {
  const rawText = await getEventsOfToday();
  const message = buildBirthdayMessage(rawText);
  await sendDiscordMessage(message);
  await sendEvolutionMessage(message);
}
