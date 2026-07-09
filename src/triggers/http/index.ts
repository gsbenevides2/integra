import openapi from "@elysia/openapi";
import {
    REQUEST_ID_HEADER,
    type ElysiaRouteMemory,
    type HttpSettings,
    type HttpTrigger,
    type MemoryRouteKey,
} from "./types";
import Elysia, { StatusMap, type AnyElysia, type HTTPHeaders } from "elysia";
import { startTracer, endTracer, createTracerIfNotExtistsAndAppendEvent } from "instrumentation";

declare global {
    var elysiaClient: Elysia | undefined;
    var elysiaRoutesMemory: ElysiaRouteMemory | undefined;
}

const ICON_PATH = "assets/icons" as const;

export function getTraceId(headers: HTTPHeaders) {
    return String(headers[REQUEST_ID_HEADER]) ?? crypto.randomUUID();
}

export function getTriggerId(method: string, path: string) {
    return globalThis.elysiaRoutesMemory?.get(`${method.toLowerCase()}-${path}`) ?? "unknown";
}

function createGlobalElysia() {
    global.elysiaClient = new Elysia()
        .on("request", ({ set }) => {
            set.headers[REQUEST_ID_HEADER] = crypto.randomUUID();
        })
        .use(openapi())
        .get("/favicon.ico", () => Bun.file(`${ICON_PATH}/favicon.ico`))
        .get("/favicon-32x32.png", () =>
            Bun.file(`${ICON_PATH}/favicon-32x32.png`),
        )
        .get("/favicon-16x16.png", () =>
            Bun.file(`${ICON_PATH}/favicon-16x16.png`),
        )
        .get("/apple-touch-icon.png", () =>
            Bun.file(`${ICON_PATH}/apple-touch-icon.png`),
        )
        .get("/android-chrome-192x192.png", () =>
            Bun.file(`${ICON_PATH}/android-chrome-192x192.png`),
        )
        .get("/android-chrome-512x512.png", () =>
            Bun.file(`${ICON_PATH}/android-chrome-512x512.png`),
        )
        .get("/safari-pinned-tab.svg", () =>
            new Response(Bun.file(`${ICON_PATH}/safari-pinned-tab.svg`), {
                headers: {
                    "Content-Type": "image/svg+xml",
                },
            }),
        )
        .get("/site.webmanifest", () =>
            new Response(Bun.file(`${ICON_PATH}/site.webmanifest`), {
                headers: {
                    "Content-Type": "application/manifest+json",
                },
            }),
        )
        .onBeforeHandle(
            async ({ body, cookie, headers, params, path, query, route, request, set }) => {
                const traceId = getTraceId(set.headers);
                const method = request.method;
                const triggerId = getTriggerId(method, route ?? path);
                const fullUrl = request.url;
                await startTracer({
                    inputData: {
                        body,
                        cookie,
                        headers,
                        params,
                        path,
                        query,
                        route,
                        method,
                        fullUrl,
                    },
                    traceId,
                    triggerId,
                    workflowType: "http",
                });
            },
        )
        .onAfterResponse(
            async ({
                responseValue,
                set,
                body,
                cookie,
                headers,
                params,
                path,
                query,
                route,
                request,
            }) => {
                const method = request.method;
                const triggerId = getTriggerId(method, route ?? path);
                const traceId = getTraceId(set.headers);
                const fullUrl = request.url;
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
                        outputData: {
                            status: statusNumber,
                            value,
                            headers: set.headers,
                        },
                    },
                    {
                        inputData: {
                            body,
                            cookie,
                            headers,
                            params,
                            path,
                            query,
                            route,
                            method,
                            fullUrl,
                        },
                        traceId,
                        triggerId,
                        workflowType: "http",
                    },
                );
            },
        )
        .onError(
            async ({ error, body, cookie, headers, params, path, query, route, request, set }) => {
                const method = request.method;
                const triggerId = getTriggerId(method, route ?? path);
                const traceId = getTraceId(set.headers);
                const fullUrl = request.url;
                await createTracerIfNotExtistsAndAppendEvent(
                    {
                        inputData: {
                            body,
                            cookie,
                            headers,
                            params,
                            path,
                            query,
                            route,
                            method,
                            fullUrl,
                        },
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
}

function saveRoutes(elysia: AnyElysia, triggerId: string) {
    const routes = elysia.routes.map<{ key: MemoryRouteKey; triggerId: string }>(
        ({ method, path }) => ({
            key: `${method.toLowerCase()}-${path}`,
            triggerId,
        }),
    );
    if (!global.elysiaRoutesMemory) global.elysiaRoutesMemory = new Map();
    for (const { key, triggerId } of routes) {
        global.elysiaRoutesMemory.set(key, triggerId);
    }
}

export default function onHttp(settings: HttpSettings, elysia: AnyElysia): HttpTrigger {
    return {
        id: settings.id,
        register: async () => {
            await saveRoutes(elysia, settings.id);
            if (!global.elysiaClient) createGlobalElysia();
            global.elysiaClient!.use(elysia);
        },
    };
}

export function startHttpServer() {
    if (global.elysiaClient) {
        const port = process.env.PORT ?? 3000;
        global.elysiaClient.listen(port);
        console.debug("Elysia HTTP Server is on: ", port);
    }
}
