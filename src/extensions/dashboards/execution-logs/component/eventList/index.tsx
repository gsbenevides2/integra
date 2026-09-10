import { useState } from "react";
import type { TracerEvent } from "extensions/scripts/execution-logs/types";
import { formatDateTime } from "extensions/scripts/execution-logs/utils";
import { JsonTreeView } from "../jsonTreeView";

interface Props {
    events: TracerEvent[];
}

export function EventList({ events }: Props) {
    return (
        <div className="flex flex-col gap-1.5">
            {events.map((event) => (
                <EventCard key={event.eventId} event={event} />
            ))}
        </div>
    );
}

interface FetchEventData {
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    input?: string;
    init?: Record<string, unknown>;
    start?: string;
    end?: string;
}

function EventCard({ event }: { event: TracerEvent }) {
    const [isOpen, setIsOpen] = useState(false);
    const isError = event.eventType === "ERROR";
    const isInstrumentableFetch = event.eventName === "Instrumentable Fetch";
    const eventData = event.eventData as FetchEventData | undefined;
    const hasRequestResponse = Boolean(
        isInstrumentableFetch && (eventData?.request || eventData?.response),
    );

    const url = typeof eventData?.input === "string" ? eventData.input : undefined;
    const init = eventData?.init as { method?: unknown } | undefined;
    const method = typeof init?.method === "string" ? init.method.toUpperCase() : "GET";
    const duration =
        eventData?.start && eventData?.end
            ? new Date(eventData.end).getTime() - new Date(eventData.start).getTime()
            : undefined;
    const hasRequestProp = Boolean(eventData?.request);
    const hasResponseProp = Boolean(eventData?.response);
    const status = (eventData?.response as { status?: number } | undefined)?.status;

    const [showFullJson, setShowFullJson] = useState(!hasRequestResponse);

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-md">
            <button
                type="button"
                className="w-full flex flex-wrap items-center gap-2 px-3 py-2 cursor-pointer text-left"
                onClick={() => setIsOpen((prev) => !prev)}
            >
                <span
                    className={`text-xs px-1.5 py-0.5 rounded-sm ${
                        isError ? "bg-red-900 text-red-300" : "bg-blue-900 text-blue-300"
                    }`}
                >
                    {isError ? "🔴" : "🔵"} {event.eventType}
                </span>
                <span className="font-bold text-sm">{event.eventName}</span>
                {event.dateTime ? (
                    <span className="ml-auto text-xs text-mist-400">
                        {formatDateTime(new Date(event.dateTime))}
                    </span>
                ) : null}
            </button>
            {isOpen && (
                <div className="flex flex-col gap-2 px-3 pb-3">
                    {typeof url === "string" ? (
                        <div className="flex flex-col gap-1">
                            <p className="text-xs break-all">
                                <span className="font-bold">Url: </span>
                                <span>{url}</span>
                            </p>
                            <p className="text-xs break-all">
                                <span className="font-bold">Method: </span>
                                <span>{method}</span>
                                {duration !== undefined ? (
                                    <>
                                        <span> - </span>
                                        <span className="font-bold">Duration: </span>
                                        <span>{duration} ms</span>
                                    </>
                                ) : null}
                                {status !== undefined ? (
                                    <>
                                        <span> - </span>
                                        <span className="font-bold">Status: </span>
                                        <span>{status}</span>
                                    </>
                                ) : null}
                            </p>
                        </div>
                    ) : null}

                    {hasRequestResponse ? (
                        <div
                            className={`grid gap-2 ${
                                hasRequestProp && hasResponseProp ? "grid-cols-2" : "grid-cols-1"
                            }`}
                        >
                            {hasRequestProp ? (
                                <div>
                                    <span className="font-bold text-xs">Request</span>
                                    <JsonTreeView data={eventData!.request as Record<string, unknown>} />
                                </div>
                            ) : null}
                            {hasResponseProp ? (
                                <div>
                                    <span className="font-bold text-xs">Response</span>
                                    <JsonTreeView data={eventData!.response as Record<string, unknown>} />
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <div>
                        {hasRequestResponse ? (
                            <button
                                type="button"
                                className="text-xs px-2 py-0.5 rounded-md hover:bg-gray-700 cursor-pointer"
                                onClick={() => setShowFullJson((prev) => !prev)}
                            >
                                {showFullJson ? "Hide" : "View full JSON"}
                            </button>
                        ) : null}
                        {showFullJson && (
                            <JsonTreeView data={eventData as Record<string, unknown>} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
