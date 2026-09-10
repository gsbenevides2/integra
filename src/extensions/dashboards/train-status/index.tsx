import { useCallback, useEffect, useState } from "react";
import { TruckIcon } from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";
import { useToast } from "core/ui/components/toast";
import { getTrainStatusEdenClient } from "extensions/scripts/train-status/client";
import type { TrainLineStatus } from "extensions/scripts/train-status/history";
import { Card } from "./component/card";
import { CardSkeleton } from "./component/cardSkeleton";
import { HistoryModal } from "./component/historyModal";

interface TrainLineRow {
    lineCode: number;
    lineColor: string;
    situation: string;
    status: TrainLineStatus | null;
    description: string | null;
    checkedAt: Date | string | null;
}

function Dashboard() {
    const [historyLineCode, setHistoryLineCode] = useState<number>();
    const [lines, setLines] = useState<TrainLineRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { showToast } = useToast();

    const fetchLines = useCallback(
        async (useLoading: boolean) => {
            if (useLoading) {
                setIsLoading(true);
            }
            const client = getTrainStatusEdenClient();
            const { data, error } = await client["train-stats"]["list-lines"].get();
            if (error) {
                showToast("Failed to fetch train lines", "error");
            } else {
                setLines(data ?? []);
            }
            if (useLoading) {
                setIsLoading(false);
            }
        },
        [showToast],
    );

    useEffect(() => {
        fetchLines(true);
        const interval = setInterval(() => {
            fetchLines(false);
        }, 4000);
        return () => {
            clearInterval(interval);
        };
    }, [fetchLines]);

    return (
        <div className="p-3 flex flex-col gap-4">
            <HistoryModal
                isOpen={historyLineCode !== undefined}
                onClose={() => setHistoryLineCode(undefined)}
                lineCode={historyLineCode}
            />

            <div className="flex justify-between">
                <h1 className="text-xl">Train Status</h1>
            </div>
            {isLoading ? (
                <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <CardSkeleton key={index} />
                    ))}
                </div>
            ) : lines.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <TruckIcon className="size-10 text-mist-500" />
                    <p className="text-mist-200">No train lines tracked yet</p>
                    <p className="text-sm text-mist-400">
                        Data will appear here once the first status check runs.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-2">
                    {lines.map((line) => (
                        <Card
                            key={line.lineCode}
                            lineCode={line.lineCode}
                            situation={line.situation}
                            status={line.status}
                            description={line.description}
                            onOpenHistory={() => setHistoryLineCode(line.lineCode)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export const trainStatusDashboard: DashboardData = {
    id: "train-status",
    content: Dashboard,
    icon: TruckIcon,
    name: "Train Status",
};
