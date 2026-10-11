import { runTrainStatusAlarm } from "../service/alarm";

export async function checkTrainLinesAlarm(): Promise<void> {
  await runTrainStatusAlarm(new Date());
}
