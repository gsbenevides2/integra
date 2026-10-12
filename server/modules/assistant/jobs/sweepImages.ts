import { getLogger, logInfo } from "@server/instrumentation/instrumentLogger";

import { ConversationService } from "../service/conversation";
import { sweepOrphanImages } from "../service/images";

const log = getLogger("assistant");

/** Daily: deletes bucket images no conversation refers to any more. */
export async function sweepAssistantImages(): Promise<void> {
  const referenced = await ConversationService.referencedImageKeys();
  const deleted = await sweepOrphanImages(referenced);
  logInfo(log, "[assistant] swept orphan images", { "assistant.image.count": deleted });
}
