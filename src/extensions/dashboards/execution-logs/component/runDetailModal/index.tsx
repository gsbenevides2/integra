import { XMarkIcon } from "@heroicons/react/24/outline";
import { IconButton } from "core/ui/components/iconButton";
import { useToast } from "core/ui/components/toast";
import { getExecutionLogsEdenClient } from "extensions/scripts/execution-logs/client";
import type { RunDocument } from "extensions/scripts/execution-logs/types";
import { formatDateTime, formatDuration } from "extensions/scripts/execution-logs/utils";
import { useCallback, useEffect, useState } from "react";
import { EventList } from "../eventList";
import { JsonTreeView } from "../jsonTreeView";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    traceId?: string;
}

function dataSize(data: Record<string, unknown>): string {
    const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
}

export function RunDetailModal({ isOpen, onClose, traceId }: Props) {
    const [isLoading, setIsLoading] = useState(true);
    const [run, setRun] = useState<RunDocument>();
    const [copied, setCopied] = useState(false);
    const { showToast } = useToast();

    const fetchRun = useCallback(async () => {
        if (!traceId) return;
        setIsLoading(true);
        const client = getExecutionLogsEdenClient();
        const { data, error } = await client["execution-logs"].runs({ traceId }).get();
        if (error) {
            showToast("Failed to fetch execution details", "error");
        } else {
            setRun(data as RunDocument);
        }
        setIsLoading(false);
    }, [traceId, showToast]);

    useEffect(() => {
        if (!isOpen || !traceId) return;
        setRun(undefined);
        fetchRun();
    }, [isOpen, traceId, fetchRun]);

    const copyTraceId = useCallback(async () => {
        if (!run) return;
        await navigator.clipboard.writeText(run.traceId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [run]);

    const durationMs =
        run?.durationMs ??
        (run?.endTime ? new Date(run.endTime).getTime() - new Date(run.startTime).getTime() : null);

    return (
        <div
            className={`fixed inset-0 z-50 bg-mist-950/90 backdrop-blur-sm flex justify-center items-center p-4 transition-opacity duration-200 ${
                isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={`bg-gray-800 w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-lg shadow-xl flex flex-col gap-4 p-4 transition-all duration-200 ${
                    isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Execution details</h3>
                    <IconButton type="button" onClick={onClose}>
                        <XMarkIcon className="size-4.5" />
                    </IconButton>
                </div>

                {isLoading || !run ? (
                    <div className="h-64 flex items-center justify-center text-mist-400 text-sm">
                        Loading execution details...
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="bg-gray-900 border border-gray-700 rounded-md p-3 flex flex-col gap-3">
                            <div className="flex flex-wrap justify-between items-center gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-mist-400">TraceId:</span>
                                    <span className="font-mono text-xs">{run.traceId}</span>
                                    <button
                                        type="button"
                                        className="text-xs px-2 py-0.5 rounded-md hover:bg-gray-700 cursor-pointer"
                                        onClick={copyTraceId}
                                    >
                                        {copied ? "Copied ✓" : "Copy"}
                                    </button>
                                </div>
                                {run.endTime ? (
                                    <span
                                        className={`text-xs px-2 py-0.5 rounded-sm font-semibold ${
                                            run.status === "ERROR"
                                                ? "bg-red-900 text-red-300"
                                                : "bg-green-900 text-green-300"
                                        }`}
                                    >
                                        {run.status ?? "SUCCESS"}
                                    </span>
                                ) : (
                                    <span className="text-xs px-2 py-0.5 rounded-sm font-semibold bg-yellow-900 text-yellow-300">
                                        🟡 In progress
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                <div>
                                    <span className="text-mist-400">TriggerId:</span>
                                    <span className="ml-2">{run.triggerId}</span>
                                </div>
                                <div>
                                    <span className="text-mist-400">WorkflowType:</span>
                                    <span className="ml-2">{run.workflowType}</span>
                                </div>
                                <div>
                                    <span className="text-mist-400">Duration:</span>
                                    <span className="ml-2">
                                        {durationMs !== null ? formatDuration(durationMs) : "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-mist-400">Start:</span>
                                    <span className="ml-2">
                                        {formatDateTime(new Date(run.startTime))}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-mist-400">End:</span>
                                    <span className="ml-2">
                                        {run.endTime ? formatDateTime(new Date(run.endTime)) : "—"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {run.inputData && (
                            <CollapsibleSection
                                title="Input Data"
                                sizeLabel={dataSize(run.inputData)}
                            >
                                <JsonTreeView data={run.inputData} />
                            </CollapsibleSection>
                        )}

                        {run.outputData && (
                            <CollapsibleSection
                                title="Output Data"
                                sizeLabel={dataSize(run.outputData)}
                            >
                                <JsonTreeView data={run.outputData} />
                            </CollapsibleSection>
                        )}

                        <div>
                            <h4 className="mb-2 font-semibold text-sm">
                                Events ({run.events.length})
                            </h4>
                            <EventList events={run.events} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function CollapsibleSection({
    title,
    sizeLabel,
    children,
}: {
    title: string;
    sizeLabel: string;
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-md">
            <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer text-left font-semibold text-sm"
                onClick={() => setIsOpen((prev) => !prev)}
            >
                {title}
                <span className="text-xs px-1.5 py-0.5 rounded-sm bg-gray-700 text-mist-300">
                    {sizeLabel}
                </span>
            </button>
            {isOpen && <div className="px-3 pb-3">{children}</div>}
        </div>
    );
}
