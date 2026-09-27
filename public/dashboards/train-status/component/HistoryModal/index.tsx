import React, { useCallback, useEffect, useState } from "react";

import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getTrainStatusEdenClient } from "../../client";
import { formatDateTime, formatDuration } from "../../formatDate";
import type { TrainLineStatus } from "../../types";

interface StatusCheck {
  status: TrainLineStatus;
  situation: string;
  description: string | null;
  checkedAt: string | Date;
}

interface StatusSegment {
  status: TrainLineStatus;
  situation: string;
  startedAt: string;
  endedAt: string | null;
  description: string | null;
}

interface ChartPoint {
  time: number;
  value: number;
  status: TrainLineStatus;
  situation: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lineCode?: number;
}

const STATUS_VALUE: Record<TrainLineStatus, number> = {
  CRITICAL: 0,
  UNKNOWN: 1,
  WARNING: 2,
  OK: 3,
};

const STATUS_LABEL: Record<TrainLineStatus, string> = {
  OK: "Operational",
  WARNING: "Warning",
  CRITICAL: "Critical",
  UNKNOWN: "Unknown",
};

const STATUS_TEXT_COLOR: Record<TrainLineStatus, string> = {
  OK: "text-green-400",
  WARNING: "text-yellow-400",
  CRITICAL: "text-red-400",
  UNKNOWN: "text-gray-400",
};

const STATUS_DOT_COLOR: Record<TrainLineStatus, string> = {
  OK: "bg-green-700",
  WARNING: "bg-yellow-600",
  CRITICAL: "bg-red-700",
  UNKNOWN: "bg-gray-600",
};

function checksToChartData(checks: StatusCheck[]): ChartPoint[] {
  return checks.map((check) => ({
    time: new Date(check.checkedAt).getTime(),
    value: STATUS_VALUE[check.status],
    status: check.status,
    situation: check.situation,
  }));
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="
      rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs
    ">
      <p>{formatDateTime(new Date(point.time), { withYear: true, withSeconds: true })}</p>
      <p className={STATUS_TEXT_COLOR[point.status]}>
        {STATUS_LABEL[point.status]}
      </p>
      <p className="text-mist-400">{point.situation}</p>
    </div>
  );
}

export function HistoryModal({ isOpen, onClose, lineCode }: Props) {
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
      if (lineCode === undefined) return;
      setIsLoading(true);
      const client = getTrainStatusEdenClient();
      const { data, error } = await client.api["train-status"]({
        code: String(lineCode),
      }).history.get({ query: before ? { before } : {} });
      if (error) {
        showToast("Failed to fetch history", "error");
      } else if (data) {
        setChecks(data.checks as unknown as StatusCheck[]);
        setSegments(data.segments as unknown as StatusSegment[]);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      }
      setIsLoading(false);
    },
    [lineCode, showToast],
  );

  useEffect(() => {
    if (!isOpen || lineCode === undefined) return;
    setCursorStack([]);
    setCurrentBefore(undefined);
    fetchHistory(undefined);
  }, [isOpen, lineCode, fetchHistory]);

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
      className={`
        fixed inset-0 z-50 flex items-center justify-center bg-mist-950/90 p-4
        backdrop-blur-sm transition-opacity duration-200
        ${isOpen ? "pointer-events-auto opacity-100" : `
          pointer-events-none opacity-0
        `}
      `}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`
          flex w-full max-w-2xl flex-col gap-4 rounded-lg bg-gray-800 p-4
          shadow-xl transition-all duration-200
          ${isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"}
        `}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">History - Line {lineCode}</h3>
          <IconButton type="button" onClick={onClose}>
            <XMarkIcon className="size-4.5" />
          </IconButton>
        </div>

        {isLoading ? (
          <div className="
            flex h-64 items-center justify-center text-sm text-mist-400
          ">
            Loading history...
          </div>
        ) : chartData.length === 0 ? (
          <div className="
            flex h-64 items-center justify-center text-sm text-mist-400
          ">
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
                  tickFormatter={(value) => formatDateTime(new Date(value))}
                  stroke="#9ca3af"
                  fontSize={12}
                />
                <YAxis
                  domain={[0, 3]}
                  ticks={[0, 1, 2, 3]}
                  tickFormatter={(value) =>
                    STATUS_LABEL[
                      (Object.keys(STATUS_VALUE) as TrainLineStatus[]).find(
                        (key) => STATUS_VALUE[key] === value,
                      ) ?? "UNKNOWN"
                    ]
                  }
                  stroke="#9ca3af"
                  fontSize={12}
                  width={80}
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
              ? `${formatDateTime(new Date(checks[0]?.checkedAt ?? ""), { withYear: true })} - ${formatDateTime(new Date(checks.at(-1)?.checkedAt ?? ""), { withYear: true })}`
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

        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {segments
            .slice()
            .reverse()
            .map((segment, index) => (
              <div
                key={`${segment.startedAt}-${index}`}
                className="
                  flex items-center justify-between rounded-md bg-gray-900 px-2
                  py-1 text-xs
                "
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className={`
                      size-2 rounded-full
                      ${STATUS_DOT_COLOR[segment.status]}
                    `}
                  />
                  <span>{STATUS_LABEL[segment.status]}</span>
                </div>
                <span className="text-mist-400">
                  since {formatDateTime(new Date(segment.startedAt))}
                </span>
                <span className="text-mist-400">
                  for{" "}
                  {formatDuration(
                    new Date(segment.startedAt).getTime(),
                    segment.endedAt
                      ? new Date(segment.endedAt).getTime()
                      : Date.now(),
                  )}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
