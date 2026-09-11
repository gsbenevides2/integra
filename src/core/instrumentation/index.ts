import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport";
import { db } from "core/db";
import { runEvents, runs } from "extensions/db/schema";
import { eq, lt } from "drizzle-orm";
import type { CreateEventData, EndTracerParams, StartTracerParams } from "./types";
import { type ClientOptions } from "openai";
import type { Treaty } from "@elysia/eden";
import { fetch } from "bun";

export const DONT_TRACE_ID = "dont-trace";

export function serializeError(error: unknown): object {
    if (error instanceof Error) {
        return {
            ...error,
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...(error.cause !== undefined ? { cause: serializeError(error.cause) } : {}),
        };
    }
    if (typeof error === "object" && error !== null) return error;
    return { message: String(error) };
}

export async function startTracer(params: StartTracerParams) {
    if (params.traceId === DONT_TRACE_ID) return;
    await db.insert(runs).values({
        ...params,
        startTime: new Date(),
    });
}

export async function endTracer(params: EndTracerParams, createTracer?: StartTracerParams) {
    if (params.traceId === DONT_TRACE_ID) return;
    if (createTracer?.traceId === DONT_TRACE_ID) return;
    const endSet = { endTime: new Date(), outputData: params.outputData, status: params.status };
    const [exists] = await db
        .select({ id: runs.id })
        .from(runs)
        .where(eq(runs.traceId, params.traceId))
        .limit(1);
    if (exists) {
        await db.update(runs).set(endSet).where(eq(runs.traceId, params.traceId));
    } else if (createTracer) {
        await db.insert(runs).values({
            ...createTracer,
            ...endSet,
            startTime: new Date(),
        });
    }
}

export async function addTracerEvent(params: CreateEventData) {
    if (params.traceId === DONT_TRACE_ID) return;
    const [run] = await db
        .select({ id: runs.id })
        .from(runs)
        .where(eq(runs.traceId, params.traceId))
        .limit(1);
    if (!run) return;
    await db.insert(runEvents).values({
        runId: run.id,
        eventName: params.eventName,
        eventData: params.eventData,
        eventType: params.eventType,
        dateTime: new Date(),
    });
}

export async function createTracerIfNotExtistsAndAppendEvent(
    params: StartTracerParams,
    createEventParams: Omit<CreateEventData, "traceId">,
) {
    if (params.traceId === DONT_TRACE_ID) return;
    const [exists] = await db
        .select({ id: runs.id })
        .from(runs)
        .where(eq(runs.traceId, params.traceId))
        .limit(1);
    if (!exists) {
        await db.insert(runs).values({
            ...params,
            startTime: new Date(),
        });
    }
    await addTracerEvent({
        ...createEventParams,
        traceId: params.traceId,
    });
}

export function transformHeadersToObjc(headers: Response["headers"]) {
    return Array.from(headers.keys()).reduce(
        (obj, key) => ({
            ...obj,
            [key]:
                key.toLowerCase() === "set-cookie"
                    ? headers.getAll("set-cookie")
                    : [headers.get(key) ?? ""],
        }),
        {} as Record<string, string[]>,
    );
}

export async function instrumentableFetch(
    traceId: string,
    input: string | URL | Request,
    init?: BunFetchRequestInit,
): Promise<Response> {
    const start = new Date();
    const body = typeof input === "object" && "body" in input ? input.body : init?.body;
    let processedBody = body;
    if (body && typeof body === "object" && "toString" in body) {
        processedBody = body.toString();
    }

    let response: Response;
    try {
        response = await fetch(input, init);
    } catch (error) {
        const end = new Date();
        let finalInput: object | string = input;
        if (typeof input === "object" && "headers" in input) {
            finalInput = {
                ...input,
                headers: transformHeadersToObjc(input.headers as unknown as Response["headers"]),
            };
        }
        if (typeof input === "object" && "href" in input) {
            finalInput = input.href;
        }

        await addTracerEvent({
            eventData: {
                start,
                end,
                input: finalInput,
                init,
                request: { processedBody },
                error: {
                    name: error instanceof Error ? error.name : "UnknownError",
                    message: error instanceof Error ? error.message : String(error),
                },
            },
            eventName: "Instrumentable Fetch",
            eventType: "ERROR",
            traceId,
        });
        throw error;
    }
    const end = new Date();
    const copyResponse = response.clone();
    let finalInput: object | string = input;
    if (typeof input === "object" && "headers" in input) {
        finalInput = {
            ...input,
            headers: transformHeadersToObjc(input.headers as unknown as Response["headers"]),
        };
    }
    if (typeof input === "object" && "href" in input) {
        finalInput = input.href;
    }

    let finalInit = init;
    if (init?.headers && "append" in init.headers) {
        finalInit = {
            ...finalInit,
            headers: transformHeadersToObjc(
                init.headers as unknown as Response["headers"],
            ) as unknown as Headers,
        };
    }

    await addTracerEvent({
        eventData: {
            start,
            end,
            input: finalInput,
            init: finalInit,
            request: {
                processedBody,
            },
            response: {
                status: copyResponse.status,
                headers: transformHeadersToObjc(
                    copyResponse.headers as unknown as Response["headers"],
                ),
                content: await copyResponse.text(),
            },
        },
        eventName: "Instrumentable Fetch",
        eventType: "INFO",
        traceId,
    });

    return response;
}

export function getInstrumentableFetchClient(traceId: string): FetchLike {
    return (input: string | URL | Request, init?: BunFetchRequestInit) =>
        instrumentableFetch(traceId, input, init);
}

type OpenAiFetch = Exclude<ClientOptions["fetch"], undefined>;

export function getOpenAIInstrumentableFetchClient(traceId: string): OpenAiFetch {
    return (input: string | URL | Request, init?: BunFetchRequestInit) =>
        instrumentableFetch(traceId, input, init);
}

type EdenFetch = Treaty.Config["fetcher"];

export function getBunFetchInstrumentableFetchClient(traceId: string): EdenFetch {
    function f(input: string | URL | Request, init?: BunFetchRequestInit) {
        return instrumentableFetch(traceId, input, init);
    }
    f.preconnect = fetch.preconnect;
    return f;
}

export async function clearOldTraces() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.delete(runs).where(lt(runs.endTime, oneDayAgo));
}
