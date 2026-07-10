import { addTracerEvent } from "instrumentation";
import { Client } from "ssh2";
import safeEnvGet from "utils/safeEnvGet";

export const SSH_DEFAULT_HOST = safeEnvGet("SSH_DEFAULT_HOST");
export const SSH_DEFAULT_PORT = parseInt(safeEnvGet("SSH_DEFAULT_PORT"), 10);
export const SSH_DEFAULT_USERNAME = safeEnvGet("SSH_DEFAULT_USERNAME");
export const SSH_DEFAULT_PRIVATE_KEY = safeEnvGet("SSH_DEFAULT_PRIVATE_KEY");

export async function sendSSHCommand(command: string, traceId: string) {
    const start = Date.now();

    return new Promise<string>(async (resolve) => {
        const conn = new Client();
        let result = "";
        conn.on("ready", () => {
            conn.exec(command, (err, stream) => {
                if (err) throw err;
                stream
                    .on("close", async (code: number) => {
                        conn.end();
                        await addTracerEvent({
                            traceId,
                            eventType: "INFO",
                            eventData: { command, result, start, end: Date.now(), code },
                            eventName: "SSH Command",
                        });
                        resolve(result);
                    })
                    .on("data", (data: string) => {
                        result += data.toString();
                    })
                    .stderr.on("data", async (data) => {
                        result += data.toString();
                        await addTracerEvent({
                            traceId,
                            eventType: "INFO",
                            eventData: { command, result, start, end: Date.now() },
                            eventName: "SSH Command",
                        });
                        resolve(result);
                    });
            });
        })
            .on("error", async (err) => {
                resolve(JSON.stringify(err));
                await addTracerEvent({
                    traceId,
                    eventType: "INFO",
                    eventData: { command, result, start, end: Date.now(), err },
                    eventName: "SSH Command",
                });
            })
            .connect({
                host: SSH_DEFAULT_HOST,
                port: SSH_DEFAULT_PORT,
                username: SSH_DEFAULT_USERNAME,
                privateKey: SSH_DEFAULT_PRIVATE_KEY,
                passphrase: "",
            });
    });
}
