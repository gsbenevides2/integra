import { sendGotifyMessage } from "@server/shared/gotify";

import { BirthdayService } from "../service/events";
import { buildBirthdayMessage } from "../service/message";

export async function sendBirthdayMessage(): Promise<void> {
  const titles = await BirthdayService.listToday();
  await sendGotifyMessage(buildBirthdayMessage(titles));
}
