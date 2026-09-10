import type { TrainLineStatus } from "extensions/scripts/train-status/history";
import { TRAIN_LINES } from "utils/train-fetchers/constants";

interface Props {
    lineCode: number;
    situation: string;
    status: TrainLineStatus | null;
    description: string | null;
    onOpenHistory: () => void;
}

const STATUS_DOT: Record<TrainLineStatus, string> = {
    OK: "bg-green-700",
    WARNING: "bg-yellow-600",
    CRITICAL: "bg-red-700",
    UNKNOWN: "bg-gray-600",
};

const STATUS_LABEL: Record<TrainLineStatus, string> = {
    OK: "Operational",
    WARNING: "Warning",
    CRITICAL: "Critical",
    UNKNOWN: "Unknown",
};

export function Card({ lineCode, situation, status, description, onOpenHistory }: Props) {
    const lineFined = TRAIN_LINES.find((l) => l.code === lineCode);
    console.log({ lineFined, TRAIN_LINES });
    const color = lineFined?.cssColor;
    console.log({ color });
    const name = lineFined?.color;
    return (
        <div
            className="bg-gray-800 p-2 text-sm rounded-md flex flex-col gap-1 cursor-pointer hover:bg-gray-700"
            onClick={onOpenHistory}
        >
            <div className="flex items-center gap-2">
                <span
                    className="size-3.5 rounded-full border border-gray-600 shrink-0"
                    style={{ backgroundColor: color }}
                />
                <p>
                    Line {lineCode} - {name}
                </p>
            </div>
            <p className="text-mist-300">{situation}</p>
            <div>
                <div className="flex gap-1 items-center">
                    <div
                        className={`h-2 w-2 rounded-full ${status ? STATUS_DOT[status] : "bg-gray-600"}`}
                    />
                    <p>Status: {status ? STATUS_LABEL[status] : "Not checked yet"}</p>
                </div>
                {(status === "WARNING" || status === "CRITICAL") && description && (
                    <p
                        className={`text-xs mt-0.5 ${
                            status === "CRITICAL" ? "text-red-400" : "text-yellow-400"
                        }`}
                    >
                        {description}
                    </p>
                )}
            </div>
        </div>
    );
}
