import { getExecutionLogsEdenClient } from "extensions/scripts/execution-logs/client";
import type { RunDocument } from "extensions/scripts/execution-logs/types";
import { formatDateTime, formatDuration } from "extensions/scripts/execution-logs/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FilterValues } from "../filterBar";

const PAGE_SIZE = 50;

type SortField = "startTime" | "endTime" | "durationMs";

interface Props {
    filters: FilterValues;
    onSelectRun: (traceId: string) => void;
}

const COLUMNS: { field: SortField | "triggerId" | "workflowType" | "status"; label: string; sortable: boolean }[] =
    [
        { field: "triggerId", label: "Trigger ID", sortable: false },
        { field: "workflowType", label: "Type", sortable: false },
        { field: "startTime", label: "Start Time", sortable: true },
        { field: "endTime", label: "End Time", sortable: true },
        { field: "status", label: "Status", sortable: false },
        { field: "durationMs", label: "Duration", sortable: true },
    ];

export function RunsTable({ filters, onSelectRun }: Props) {
    const [rows, setRows] = useState<RunDocument[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sortField, setSortField] = useState<SortField>("startTime");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const sentinelRef = useRef<HTMLDivElement>(null);
    const loadingRef = useRef(false);
    const requestIdRef = useRef(0);

    const doFetch = useCallback(
        async (cursor: string | null, reset: boolean) => {
            if (loadingRef.current) return;
            loadingRef.current = true;
            setIsLoading(true);
            const requestId = ++requestIdRef.current;
            const client = getExecutionLogsEdenClient();
            const { data, error } = await client["execution-logs"].runs.get({
                query: {
                    ...(filters.workflowType ? { workflowType: filters.workflowType } : {}),
                    ...(filters.status ? { status: filters.status } : {}),
                    ...(filters.triggerId ? { triggerId: filters.triggerId } : {}),
                    ...(filters.startTimeGte ? { startTimeGte: filters.startTimeGte } : {}),
                    ...(cursor ? { cursor } : {}),
                    sortField,
                    sortOrder,
                    limit: String(PAGE_SIZE),
                },
            });
            if (requestId !== requestIdRef.current) return;
            if (!error && data) {
                const newRows = data.runs as RunDocument[];
                setRows((prev) => (reset ? newRows : [...prev, ...newRows]));
                setNextCursor(data.nextCursor ?? null);
            }
            loadingRef.current = false;
            setIsLoading(false);
        },
        [filters, sortField, sortOrder],
    );

    useEffect(() => {
        setRows([]);
        setNextCursor(null);
        doFetch(null, true);
    }, [doFetch]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !nextCursor || isLoading) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && nextCursor && !loadingRef.current) {
                    doFetch(nextCursor, false);
                }
            },
            { threshold: 0.1 },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [nextCursor, isLoading, doFetch]);

    function toggleSort(field: SortField) {
        if (sortField === field) {
            setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortOrder("desc");
        }
    }

    if (!isLoading && rows.length === 0) {
        return <div className="text-sm text-mist-400 py-6 text-center">No executions found.</div>;
    }

    return (
        <div className="bg-gray-800 rounded-md overflow-hidden">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-900">
                        <tr>
                            {COLUMNS.map((col) => (
                                <th
                                    key={col.field}
                                    className={`text-left px-3 py-2 font-semibold text-mist-300 ${
                                        col.sortable ? "cursor-pointer select-none hover:text-white" : ""
                                    }`}
                                    onClick={() => col.sortable && toggleSort(col.field as SortField)}
                                >
                                    {col.label}
                                    {col.sortable && sortField === col.field && (
                                        <span className="ml-1">{sortOrder === "asc" ? "▲" : "▼"}</span>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((run) => (
                            <tr
                                key={run.traceId}
                                className="border-t border-gray-700 hover:bg-gray-700 cursor-pointer"
                                onClick={() => onSelectRun(run.traceId)}
                            >
                                <td className="px-3 py-1.5 font-mono text-xs">{run.triggerId}</td>
                                <td className="px-3 py-1.5">
                                    <span className="text-xs bg-gray-700 rounded-sm px-1.5 py-0.5">
                                        {run.workflowType}
                                    </span>
                                </td>
                                <td className="px-3 py-1.5">{formatDateTime(new Date(run.startTime))}</td>
                                <td className="px-3 py-1.5">
                                    {run.endTime ? formatDateTime(new Date(run.endTime)) : "-"}
                                </td>
                                <td className="px-3 py-1.5">
                                    <span
                                        className={`text-xs px-1.5 py-0.5 rounded-sm font-semibold ${
                                            !run.endTime
                                                ? "bg-yellow-900 text-yellow-300"
                                                : run.status === "ERROR"
                                                  ? "bg-red-900 text-red-300"
                                                  : "bg-green-900 text-green-300"
                                        }`}
                                    >
                                        {run.endTime ? (run.status ?? "SUCCESS") : "running"}
                                    </span>
                                </td>
                                <td className="px-3 py-1.5">
                                    {run.durationMs != null ? formatDuration(run.durationMs) : "-"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {isLoading && (
                    <div className="flex flex-col gap-1 p-2">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <div key={index} className="h-6 w-full bg-gray-700 rounded-sm animate-pulse" />
                        ))}
                    </div>
                )}
                <div ref={sentinelRef} className="h-2" />
            </div>
        </div>
    );
}
