import { StatusPlatformService } from "../service/platforms";

export async function checkPlatformsStatus(): Promise<void> {
  await StatusPlatformService.checkAll();
}
