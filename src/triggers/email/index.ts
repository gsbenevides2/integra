import IMAP from "imap";
import type { Trigger, TriggerSettings } from "triggers";
import type { EmailAccountKey } from "./types";
import { emailAccounts } from "./accounts";
import { simpleParser } from "mailparser";
import { addTracerEvent, endTracer, startTracer } from "instrumentation";
import type { TracerStatus } from "instrumentation/types";

export interface EmailSettings extends TriggerSettings {
    account: EmailAccountKey;
    mailbox?: string;
    searchCriteria?: (string | string[])[];
    markSeen?: boolean;
}

export interface EmailSubscription {
    account: EmailAccountKey;
    mailbox: string;
    searchCriteria: (string | string[])[];
    markSeen: boolean;
    call: EmailCall;
    triggerId: string;
}

export interface EmailTrigger extends Trigger {}

export type EmailCall = (email: Record<string, unknown>, traceId: string) => Promise<void>;

declare global {
    var emailConnections: Map<EmailAccountKey, IMAP> | undefined;
    var emailSubscriptions: EmailSubscription[] | undefined;
}

export default function onEmail(settings: EmailSettings, func: EmailCall): EmailTrigger {
    return {
        id: settings.id,
        register: async () => {
            if (!global.emailSubscriptions) global.emailSubscriptions = [];

            global.emailSubscriptions = [
                ...global.emailSubscriptions,
                {
                    account: settings.account,
                    mailbox: settings.mailbox ?? "INBOX",
                    searchCriteria: settings.searchCriteria ?? ["UNSEEN"],
                    markSeen: settings.markSeen ?? true,
                    call: func,
                    triggerId: settings.id,
                },
            ];
        },
    };
}

export async function startEmailClients() {
    if (!global.emailSubscriptions) return;

    for (const [key, config] of Object.entries(emailAccounts)) {
        const accountKey = key as EmailAccountKey;
        const subs = global.emailSubscriptions.filter((sub) => sub.account === accountKey);
        if (subs.length === 0) continue;

        const imap = new IMAP({
            user: config.user,
            password: config.password,
            host: config.host,
            port: config.port,
            tls: config.tls,
            keepalive: {
                interval: 10000,
                idleInterval: 300000,
                forceNoop: false,
            },
        });

        if (!global.emailConnections) global.emailConnections = new Map();
        global.emailConnections.set(accountKey, imap);

        function openMailbox(mailbox: string): Promise<void> {
            return new Promise((resolve, reject) => {
                imap.openBox(mailbox, true, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        function fetchUnseen(mailbox: string, markSeen: boolean): Promise<void> {
            return new Promise((resolve, reject) => {
                imap.search(subs[0]?.searchCriteria ?? ["UNSEEN"], (err, uids) => {
                    if (err || !uids?.length) {
                        resolve();
                        return;
                    }

                    const fetch = imap.fetch(uids, {
                        bodies: "",
                        markSeen,
                        struct: true,
                    });

                    fetch.on("message", (msg) => {
                        const email: Record<string, unknown> = { uid: 0 };
                        let body = "";

                        msg.on("body", (stream) => {
                            stream.on("data", (chunk) => {
                                body += chunk.toString("utf8");
                            });
                        });

                        msg.once("attributes", (attrs) => {
                            email.uid = attrs.uid;
                            email.flags = attrs.flags;
                            email.date = attrs.date;
                        });

                        msg.once("end", async () => {
                            try {
                                const parsed = await simpleParser(body);
                                email.from = parsed.from?.text;
                                const emailTo = Array.isArray(parsed.to)
                                    ? parsed.to.map((a) => a.text).join(";")
                                    : parsed.to?.text;
                                email.to = emailTo;
                                email.subject = parsed.subject;
                                email.text = parsed.text;
                                email.html = parsed.html;
                                email.date = parsed.date ?? email.date;
                                email.messageId = parsed.messageId;
                                email.attachments = parsed.attachments;
                            } catch {
                                email.body = body;
                            }

                            const mailboxSubs = subs.filter((s) => s.mailbox === mailbox);
                            await Promise.all(
                                mailboxSubs.map(async (s) => {
                                    const traceId = crypto.randomUUID();
                                    await startTracer({
                                        inputData: {
                                            subs: s,
                                            email,
                                        },
                                        traceId,
                                        triggerId: s.triggerId,
                                        workflowType: "email",
                                    });
                                    let status: TracerStatus = "SUCCESS";
                                    try {
                                        await s.call(email, traceId);
                                    } catch (error: unknown) {
                                        status = "ERROR";
                                        await addTracerEvent({
                                            eventData: error as object,
                                            eventName: "Email on Error",
                                            eventType: "ERROR",
                                            traceId,
                                        });
                                    } finally {
                                        await endTracer({
                                            outputData: {},
                                            status,
                                            traceId,
                                        });
                                    }
                                }),
                            );
                        });
                    });

                    fetch.once("error", reject);
                    fetch.once("end", resolve);
                });
            });
        }

        imap.once("ready", async () => {
            console.debug(`Email conectado: ${key}`);

            const nonDuplicatedMailboxes = subs.filter(
                (sub, index, arr) => index === arr.findIndex((s) => s.mailbox === sub.mailbox),
            );

            for (const sub of nonDuplicatedMailboxes) {
                try {
                    await openMailbox(sub.mailbox);
                    await fetchUnseen(sub.mailbox, sub.markSeen);
                } catch (err) {
                    console.debug(`Erro ao abrir mailbox ${sub.mailbox}:`, err);
                }
            }

            imap.on("mail", async (_numNew: number) => {
                for (const sub of nonDuplicatedMailboxes) {
                    try {
                        await openMailbox(sub.mailbox);
                        await fetchUnseen(sub.mailbox, sub.markSeen);
                    } catch (err) {
                        console.debug(`Erro ao buscar novos emails ${sub.mailbox}:`, err);
                    }
                }
            });
        });

        imap.on("error", (err) => {
            console.debug(`Erro Email: ${key}`, err);
        });

        imap.on("close", () => {
            console.debug(`Email desconectado: ${key}`);
        });

        imap.connect();

        process.on("SIGTERM", () => imap.end());
        process.on("SIGKILL", () => imap.end());
    }
}
