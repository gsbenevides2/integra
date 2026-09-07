import onHttp, { getTraceId } from "core/triggers/http";
import { loginFailedBody } from "./types";
import { generateMessage } from "./utils";
import sendDiscordMessage from "utils/discord/sendMessage";
import { addTracerEvent } from "core/instrumentation";
import Elysia from "elysia";

const elysiaClient = new Elysia().post(
    "/authentik-login-failed",
    async ({ body, set }) => {
        const traceId = getTraceId(set.headers);
        const message = generateMessage(body.body, body.event_user_email, body.event_user_username);
        await addTracerEvent({
            eventData: { message },
            eventName: "Generated Message",
            eventType: "INFO",
            traceId,
        });
        await sendDiscordMessage(message, traceId);
        return "OK";
    },
    {
        body: loginFailedBody,
    },
);

export const authentikLoginFailed = onHttp(
    {
        id: "authentik:loginFailed",
    },
    elysiaClient,
);
