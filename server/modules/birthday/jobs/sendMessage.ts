import { sendGotifyMessage } from "@server/shared/gotify";

import { getEventsOfToday } from "../service/events";
import { buildBirthdayMessage } from "../service/message";

export async function sendBirthdayMessage(): Promise<void> {
  const rawText = await getEventsOfToday();
  const message = buildBirthdayMessage(rawText);
  await sendGotifyMessage(message);
}
