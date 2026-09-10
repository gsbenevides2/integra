import { ClockIcon } from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";
import { useToast } from "core/ui/components/toast";
import { getExecutionLogsEdenClient } from "extensions/scripts/execution-logs/client";
import type { RunDocument } from "extensions/scripts/execution-logs/types";
import { useCallback, useEffect, useState } from "react";
import { DotChart } from "./component/dotChart";
import { FilterBar, type FilterValues } from "./component/filterBar";
import { RunDetailModal } from "./component/runDetailModal";
import { RunsTable } from "./component/runsTable";

function Dashboard() {
    const [filters, setFilters] = useState<FilterValues>({
        startTimeGte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    const [runs, setRuns] = useState<RunDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTraceId, setSelectedTraceId] = useState<string>();
    const { showToast } = useToast();

    const fetchRuns = useCallback(async () => {
        setIsLoading(true);
        const client = getExecutionLogsEdenClient();
        const { data, error } = await client["execution-logs"].runs.get({
            query: {
                ...(filters.workflowType ? { workflowType: filters.workflowType } : {}),
                ...(filters.status ? { status: filters.status } : {}),
                ...(filters.triggerId ? { triggerId: filters.triggerId } : {}),
                ...(filters.startTimeGte ? { startTimeGte: filters.startTimeGte } : {}),
                limit: "200",
            },
        });
        if (error) {
            showToast("Failed to fetch executions", "error");
        } else {
            setRuns((data?.runs as RunDocument[] | undefined) ?? []);
        }
        setIsLoading(false);
    }, [filters, showToast]);

    useEffect(() => {
        fetchRuns();
        const interval = setInterval(fetchRuns, 15000);
        return () => clearInterval(interval);
    }, [fetchRuns]);

    return (
        <div className="p-3 flex flex-col gap-4">
            <RunDetailModal
                isOpen={Boolean(selectedTraceId)}
                onClose={() => setSelectedTraceId(undefined)}
                traceId={selectedTraceId}
            />

            <div className="flex justify-between items-center">
                <h1 className="text-xl">Execution History</h1>
                <span className="text-sm text-mist-400">{runs.length} executions</span>
            </div>

            <FilterBar onFilterChange={setFilters} />

            {isLoading && runs.length === 0 ? (
                <div className="h-[360px] flex items-center justify-center text-mist-400 text-sm">
                    Loading executions...
                </div>
            ) : runs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <ClockIcon className="size-10 text-mist-500" />
                    <p className="text-mist-200">No executions found</p>
                    <p className="text-sm text-mist-400">
                        Try widening the time range or clearing the filters.
                    </p>
                </div>
            ) : (
                <DotChart runs={runs} onSelectRun={setSelectedTraceId} />
            )}

            <div>
                <h2 className="text-lg mb-2">Runs</h2>
                <RunsTable filters={filters} onSelectRun={setSelectedTraceId} />
            </div>
        </div>
    );
}

export const executionLogsDashboard: DashboardData = {
    id: "execution-logs",
    content: Dashboard,
    icon: ClockIcon,
    name: "Execution History",
};
