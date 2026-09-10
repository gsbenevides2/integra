import { getExecutionLogsEdenClient } from "extensions/scripts/execution-logs/client";
import { useCallback, useEffect, useState } from "react";

export interface FilterValues {
    workflowType?: string;
    status?: "SUCCESS" | "ERROR";
    triggerId?: string;
    startTimeGte?: string;
}

const DATE_PRESETS = [
    { label: "15min", ms: 15 * 60 * 1000 },
    { label: "1h", ms: 60 * 60 * 1000 },
    { label: "6h", ms: 6 * 60 * 60 * 1000 },
    { label: "24h", ms: 24 * 60 * 60 * 1000 },
    { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
];

const STATUSES = ["SUCCESS", "ERROR"] as const;

interface Props {
    onFilterChange: (filters: FilterValues) => void;
}

export function FilterBar({ onFilterChange }: Props) {
    const [workflowType, setWorkflowType] = useState("");
    const [status, setStatus] = useState("");
    const [triggerId, setTriggerId] = useState("");
    const [activePreset, setActivePreset] = useState<string | null>("24h");
    const [triggerIds, setTriggerIds] = useState<string[]>([]);
    const [workflowTypes, setWorkflowTypes] = useState<string[]>([]);

    useEffect(() => {
        const client = getExecutionLogsEdenClient();
        client["execution-logs"]["trigger-ids"].get().then(({ data }) => {
            setTriggerIds(data?.triggerIds ?? []);
        });
        client["execution-logs"]["workflow-types"].get().then(({ data }) => {
            setWorkflowTypes(data?.workflowTypes ?? []);
        });
    }, []);

    const emit = useCallback(
        (overrides: Partial<FilterValues & { preset: string | null }>) => {
            const presetLabel =
                overrides.preset !== undefined ? overrides.preset : activePreset;
            const preset = DATE_PRESETS.find((p) => p.label === presetLabel);
            onFilterChange({
                workflowType: (overrides.workflowType ?? workflowType) || undefined,
                status: (overrides.status ?? status) as FilterValues["status"],
                triggerId: (overrides.triggerId ?? triggerId) || undefined,
                startTimeGte: preset ? new Date(Date.now() - preset.ms).toISOString() : undefined,
            });
        },
        [workflowType, status, triggerId, activePreset, onFilterChange],
    );

    function handlePresetClick(label: string) {
        const next = activePreset === label ? null : label;
        setActivePreset(next);
        emit({ preset: next });
    }

    function clearAll() {
        setWorkflowType("");
        setStatus("");
        setTriggerId("");
        setActivePreset(null);
        onFilterChange({});
    }

    return (
        <div className="flex flex-wrap gap-2 items-end">
            <label className="flex flex-col gap-0.5 text-xs">
                <span className="text-mist-400">Workflow</span>
                <select
                    className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm"
                    value={workflowType}
                    onChange={(e) => {
                        setWorkflowType(e.target.value);
                        emit({ workflowType: e.target.value });
                    }}
                >
                    <option value="">Todos</option>
                    {workflowTypes.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            </label>

            <label className="flex flex-col gap-0.5 text-xs">
                <span className="text-mist-400">Status</span>
                <select
                    className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm"
                    value={status}
                    onChange={(e) => {
                        setStatus(e.target.value);
                        emit({ status: e.target.value as FilterValues["status"] });
                    }}
                >
                    <option value="">Todos</option>
                    {STATUSES.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
            </label>

            <label className="flex flex-col gap-0.5 text-xs">
                <span className="text-mist-400">Trigger ID</span>
                <select
                    className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm"
                    value={triggerId}
                    onChange={(e) => {
                        setTriggerId(e.target.value);
                        emit({ triggerId: e.target.value });
                    }}
                >
                    <option value="">Todos</option>
                    {triggerIds.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            </label>

            <div className="flex flex-col gap-0.5">
                <span className="text-xs text-mist-400">Período</span>
                <div className="flex rounded-md overflow-hidden border border-gray-700">
                    {DATE_PRESETS.map((p) => (
                        <button
                            key={p.label}
                            type="button"
                            className={`text-xs px-2 py-1 cursor-pointer ${
                                activePreset === p.label
                                    ? "bg-mist-900"
                                    : "bg-gray-800 hover:bg-gray-700"
                            }`}
                            onClick={() => handlePresetClick(p.label)}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            <button
                type="button"
                className="text-xs px-2 py-1 rounded-md hover:bg-gray-700 cursor-pointer"
                onClick={clearAll}
            >
                Limpar filtros
            </button>
        </div>
    );
}
