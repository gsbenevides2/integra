import onHttp from "triggers/http";
import { loginFailedBody } from "./types";
import { generateMessage } from "./utils";
import sendDiscordMessage from "utils/discord/sendMessage";
import { TypedElysia } from "triggers/http/types";
import { addTracerEvent } from "instrumentation";

const elysiaClient = TypedElysia().post(
    "/authentik-login-failed",
    async ({ body, traceId }) => {
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
