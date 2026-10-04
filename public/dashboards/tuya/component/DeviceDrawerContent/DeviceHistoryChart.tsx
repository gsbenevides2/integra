import React from "react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { HistoryPoint } from "../../types";
import {
  evenTicks,
  formatTime,
  makeTickFormatter,
  tooltipStyle,
} from "../chartUtils";

const HOUR = 3_600_000;

export function DeviceHistoryChart({ data }: { data: HistoryPoint[] }) {
  const chartData = data
    .map((point) => ({
      ts: Date.parse(point.recordedAt),
      // Off or unreachable counts as 0% so the area shows when light was really on.
      brightness: point.power && point.online ? (point.brightness ?? 100) : 0,
      colorHex: point.colorHex,
      online: point.online,
    }))
    .sort((a, b) => a.ts - b.ts);

  const span =
    chartData.length > 1
      ? chartData[chartData.length - 1].ts - chartData[0].ts
      : 0;

  // Raw snapshots are bursty (many toggles in minutes), so plot the
  // time-weighted average brightness per bucket (~48 buckets, 1h minimum).
  const bucketMs = Math.max(HOUR, Math.ceil(span / 48 / HOUR) * HOUR);
  const start = chartData.length ? chartData[0].ts : 0;
  const end = chartData.length ? chartData[chartData.length - 1].ts : 0;
  const buckets: { ts: number; brightness: number }[] = [];
  for (
    let from = Math.floor(start / bucketMs) * bucketMs;
    from <= end;
    from += bucketMs
  ) {
    const to = from + bucketMs;
    let sum = 0;
    chartData.forEach((point, i) => {
      const next = chartData[i + 1]?.ts ?? Math.max(to, end);
      const overlap = Math.min(next, to) - Math.max(point.ts, from);
      if (overlap > 0) sum += overlap * point.brightness;
    });
    buckets.push({
      ts: from + bucketMs / 2,
      brightness: Math.round(sum / bucketMs),
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-gray-800 p-3">
      <h3 className="text-sm font-semibold">Histórico</h3>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={buckets}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#374151"
              opacity={0.4}
            />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={makeTickFormatter(span)}
              tick={{ fontSize: 11 }}
              stroke="#9ca3af"
              ticks={evenTicks(start, end)}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="#9ca3af"
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              unit="%"
            />
            <Tooltip
              labelFormatter={(value) => formatTime(Number(value))}
              formatter={(value) => [`${value}%`, "Brilho médio"]}
              contentStyle={tooltipStyle}
            />
            <Area
              type="monotone"
              dataKey="brightness"
              stroke="#fbbf24"
              fill="#fbbf24"
              fillOpacity={0.3}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
