import { TrainStatusService } from "../service/checks";

export async function checkTrainLinesStatus(): Promise<void> {
  await TrainStatusService.checkAll();
}
