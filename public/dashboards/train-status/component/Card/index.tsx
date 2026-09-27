import React from "react";

import { TRAIN_LINES } from "@server/modules/train-status/model";

import type { TrainLineStatus } from "../../types";

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

export function Card({
  lineCode,
  situation,
  status,
  description,
  onOpenHistory,
}: Props) {
  const line = TRAIN_LINES.find((l) => l.code === lineCode);

  return (
    <div
      className="
        flex cursor-pointer flex-col gap-1 rounded-md bg-gray-800 p-2 text-sm
        hover:bg-gray-700
      "
      onClick={onOpenHistory}
    >
      <div className="flex items-center gap-2">
        <span
          className="size-3.5 shrink-0 rounded-full border border-gray-600"
          style={{ backgroundColor: line?.cssColor }}
        />
        <p>
          Line {lineCode} - {line?.color}
        </p>
      </div>
      <p className="text-mist-300">{situation}</p>
      <div>
        <div className="flex items-center gap-1">
          <div
            className={`
              size-2 rounded-full
              ${status ? STATUS_DOT[status] : "bg-gray-600"}
            `}
          />
          <p>Status: {status ? STATUS_LABEL[status] : "Not checked yet"}</p>
        </div>
        {(status === "WARNING" || status === "CRITICAL") && description && (
          <p
            className={`
              mt-0.5 text-xs
              ${status === "CRITICAL" ? "text-red-400" : "text-yellow-400"}
            `}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
