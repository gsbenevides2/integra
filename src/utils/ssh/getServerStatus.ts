import { sendSSHCommand } from "./sendCommand";
import { SistemaStatusSchema } from "./types";

export async function getServerStatus(traceId: string) {
    const serverResponse = await sendSSHCommand("/home/gsbenevides2/stats.sh", traceId);
    const serverJsonResponse = SistemaStatusSchema.parse(JSON.parse(serverResponse));
    return serverJsonResponse;
}
