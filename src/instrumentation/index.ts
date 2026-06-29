import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport";
import { runModel } from "./mongo";
import type { CreateEventData, EndTracerParams, StartTracerParams } from "./types";
import { type ClientOptions } from "openai";

export async function startTracer(params: StartTracerParams) {
    await runModel.create({
        ...params,
        startTime: new Date(),
    });
}

export async function endTracer(params: EndTracerParams, createTracer?: StartTracerParams) {
    const endSet = { endTime: new Date(), outputData: params.outputData, status: params.status };
    const exists = await runModel.findOne({
        traceId: params.traceId,
    });
    if (exists) {
        await runModel.updateOne(
            {
                traceId: params.traceId,
            },
            {
                $set: endSet,
            },
        );
    } else if (createTracer) {
        await runModel.create({
            ...createTracer,
            ...endSet,
            startTime: new Date(),
        });
    }
}

export async function addTracerEvent(params: CreateEventData) {
    await runModel.updateOne(
        {
            traceId: params.traceId,
        },
        {
            $push: {
                events: {
                    eventId: crypto.randomUUID(),
                    eventName: params.eventName,
                    eventData: params.eventData,
                    eventType: params.eventType,
                    dateTime: new Date(),
                },
            },
        },
    );
}

export async function createTracerIfNotExtistsAndAppendEvent(
    params: StartTracerParams,
    createEventParams: Omit<CreateEventData, "traceId">,
) {
    const exists = await runModel.findOne({
        traceId: params.traceId,
    });
    if (!exists) {
        await runModel.create({
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
    const response = await fetch(input, init);
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
            headers: transformHeadersToObjc(init.headers as unknown as Response["headers"]),
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
