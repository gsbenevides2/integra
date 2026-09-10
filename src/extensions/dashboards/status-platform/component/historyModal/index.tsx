import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { format, formatDistanceStrict } from "date-fns";
import { IconButton } from "core/ui/components/iconButton";
import { useToast } from "core/ui/components/toast";
import { getPlatformStatusEdenClient } from "extensions/scripts/platform-status/client";
import { useCallback, useEffect, useState } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

interface StatusCheck {
    status: "OK" | "DOWN";
    problemDescription: string | null;
    checkedAt: string | Date;
}

interface StatusSegment {
    status: "OK" | "DOWN";
    startedAt: string;
    endedAt: string | null;
    problemDescription: string | null;
}

interface ChartPoint {
    time: number;
    value: number;
    status: "OK" | "DOWN";
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    platformId?: string;
    platformName?: string;
}

function checksToChartData(checks: StatusCheck[]): ChartPoint[] {
    return checks.map((check) => ({
        time: new Date(check.checkedAt).getTime(),
        value: check.status === "OK" ? 1 : 0,
        status: check.status,
    }));
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs">
            <p>{format(point.time, "dd/MM/yyyy HH:mm:ss")}</p>
            <p className={point.status === "OK" ? "text-green-400" : "text-red-400"}>
                {point.status === "OK" ? "Operational" : "Down"}
            </p>
        </div>
    );
}

export function HistoryModal({ isOpen, onClose, platformId, platformName }: Props) {
    const [isLoading, setIsLoading] = useState(true);
    const [checks, setChecks] = useState<StatusCheck[]>([]);
    const [segments, setSegments] = useState<StatusSegment[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([]);
    const [currentBefore, setCurrentBefore] = useState<string>();
    const { showToast } = useToast();

    const fetchHistory = useCallback(
        async (before?: string) => {
            if (!platformId) return;
            setIsLoading(true);
            const client = getPlatformStatusEdenClient();
            const { data, error } = await client["platform-stats"]({ id: platformId })
                .history.get({
                    query: before ? { before } : {},
                });
            if (error) {
                showToast("Failed to fetch history", "error");
            } else if (data) {
                setChecks(data.checks);
                setSegments(data.segments);
                setHasMore(data.hasMore);
                setNextCursor(data.nextCursor);
            }
            setIsLoading(false);
        },
        [platformId, showToast],
    );

    useEffect(() => {
        if (!isOpen || !platformId) return;
        setCursorStack([]);
        setCurrentBefore(undefined);
        fetchHistory(undefined);
    }, [isOpen, platformId, fetchHistory]);

    const goOlder = useCallback(() => {
        if (!nextCursor) return;
        setCursorStack((stack) => [...stack, currentBefore]);
        setCurrentBefore(nextCursor);
        fetchHistory(nextCursor);
    }, [nextCursor, currentBefore, fetchHistory]);

    const goNewer = useCallback(() => {
        setCursorStack((stack) => {
            if (stack.length === 0) return stack;
            const previous = stack[stack.length - 1];
            setCurrentBefore(previous);
            fetchHistory(previous);
            return stack.slice(0, -1);
        });
    }, [fetchHistory]);

    const chartData = checksToChartData(checks);

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
                className={`bg-gray-800 w-full max-w-2xl rounded-lg shadow-xl flex flex-col gap-4 p-4 transition-all duration-200 ${
                    isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">History - {platformName}</h3>
                    <IconButton type="button" onClick={onClose}>
                        <XMarkIcon className="size-4.5" />
                    </IconButton>
                </div>

                {isLoading ? (
                    <div className="h-64 flex items-center justify-center text-mist-400 text-sm">
                        Loading history...
                    </div>
                ) : chartData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-mist-400 text-sm">
                        No history available for this period.
                    </div>
                ) : (
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis
                                    dataKey="time"
                                    type="number"
                                    domain={["dataMin", "dataMax"]}
                                    tickFormatter={(value) => format(value, "dd/MM HH:mm")}
                                    stroke="#9ca3af"
                                    fontSize={12}
                                />
                                <YAxis
                                    domain={[0, 1]}
                                    ticks={[0, 1]}
                                    tickFormatter={(value) => (value === 1 ? "Up" : "Down")}
                                    stroke="#9ca3af"
                                    fontSize={12}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Area
                                    type="stepAfter"
                                    dataKey="value"
                                    stroke="#22c55e"
                                    fill="#22c55e"
                                    fillOpacity={0.3}
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <IconButton
                        type="button"
                        onClick={goNewer}
                        disabled={cursorStack.length === 0}
                        className="disabled:opacity-30"
                    >
                        <ChevronLeftIcon className="size-4.5" />
                    </IconButton>
                    <p className="text-xs text-mist-400">
                        {checks.length > 0
                            ? `${format(new Date(checks[0]?.checkedAt ?? ""), "dd/MM/yyyy HH:mm")} - ${format(new Date(checks.at(-1)?.checkedAt ?? ""), "dd/MM/yyyy HH:mm")}`
                            : ""}
                    </p>
                    <IconButton
                        type="button"
                        onClick={goOlder}
                        disabled={!hasMore}
                        className="disabled:opacity-30"
                    >
                        <ChevronRightIcon className="size-4.5" />
                    </IconButton>
                </div>

                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                    {segments
                        .slice()
                        .reverse()
                        .map((segment, index) => (
                            <div
                                key={`${segment.startedAt}-${index}`}
                                className="flex items-center justify-between bg-gray-900 rounded-md px-2 py-1 text-xs"
                            >
                                <div className="flex items-center gap-1.5">
                                    <div
                                        className={`h-2 w-2 rounded-full ${
                                            segment.status === "OK" ? "bg-green-700" : "bg-red-700"
                                        }`}
                                    />
                                    <span>{segment.status === "OK" ? "Operational" : "Down"}</span>
                                </div>
                                <span className="text-mist-400">
                                    since {format(new Date(segment.startedAt), "dd/MM HH:mm")}
                                </span>
                                <span className="text-mist-400">
                                    for{" "}
                                    {formatDistanceStrict(
                                        segment.endedAt ? new Date(segment.endedAt) : new Date(),
                                        new Date(segment.startedAt),
                                    )}
                                </span>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
}
