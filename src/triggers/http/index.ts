import openapi from "@elysia/openapi";
import { TypedElysia, type HttpSettings, type HttpTrigger } from "./types";
import { StatusMap, type AnyElysia } from "elysia";
import { startTracer, endTracer, createTracerIfNotExtistsAndAppendEvent } from "instrumentation";

declare global {
    var elysiaClient: TypedElysia;
    var hasRegisters: boolean;
}

global.elysiaClient = TypedElysia()
    .use(openapi())
    .onBeforeHandle(
        async ({ triggerId, traceId, body, cookie, headers, params, path, query, route }) => {
            if (!traceId) return;
            await startTracer({
                inputData: { body, cookie, headers, params, path, query, route },
                traceId,
                triggerId,
                workflowType: "http",
            });
        },
    )
    .onAfterResponse(
        async ({
            traceId,
            responseValue,
            set,
            triggerId,
            body,
            cookie,
            headers,
            params,
            path,
            query,
            route,
        }) => {
            if (!traceId) return;
            const status = set.status;
            let statusNumber = 0;

            if (typeof status === "string") {
                statusNumber = StatusMap[status];
            } else if (typeof status === "number") {
                statusNumber = status;
            }

            const value = responseValue ?? "";
            await endTracer(
                {
                    traceId,
                    status: statusNumber >= 200 && statusNumber < 300 ? "SUCCESS" : "ERROR",
                    outputData: { status: statusNumber, value },
                },
                {
                    inputData: { body, cookie, headers, params, path, query, route },
                    traceId,
                    triggerId,
                    workflowType: "http",
                },
            );
        },
    )
    .onError(
        async ({
            traceId,
            error,
            triggerId,
            body,
            cookie,
            headers,
            params,
            path,
            query,
            route,
        }) => {
            if (!traceId) return;

            await createTracerIfNotExtistsAndAppendEvent(
                {
                    inputData: { body, cookie, headers, params, path, query, route },
                    traceId,
                    triggerId,
                    workflowType: "http",
                },
                {
                    eventName: "Elysia On Error",
                    eventData: error,
                    eventType: "ERROR",
                },
            );
        },
    );

global.hasRegisters = false;

export default function onHttp(settings: HttpSettings, elysia: AnyElysia): HttpTrigger {
    return {
        id: settings.id,
        register: async () => {
            global.hasRegisters = true;
            elysia.decorate("triggerId", settings.id);
            elysia.config.name = settings.id;
            global.elysiaClient.use(elysia);
        },
    };
}

export function startHttpServer() {
    if (global.hasRegisters) {
        const port = process.env.PORT ?? 3000;
        global.elysiaClient.listen(port);
        console.debug("Elysia HTTP Server is on: ", port);
    }
}
