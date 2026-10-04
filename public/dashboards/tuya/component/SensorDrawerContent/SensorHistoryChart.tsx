import React from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SensorReading } from "../../types";
import {
  bucketCount,
  downsample,
  evenTicks,
  formatTime,
  makeTickFormatter,
  tooltipStyle,
} from "../chartUtils";

interface Props {
  readings: SensorReading[];
  code: string;
  label: string;
  /** Divides the raw value, for data points reported in tenths. */
  scale?: number;
  unit?: string;
  /** Counts "true" readings per hour/day as bars instead of a line. */
  boolean?: boolean;
  /** Label for the bars' tooltip, e.g. "aberturas". */
  eventLabel?: string;
  /** Ordered labels for a discrete 1..n scale (e.g. Baixa/Média/Alta), drawn as steps. */
  levels?: string[];
  color?: string;
}

export function SensorHistoryChart({
  readings,
  code,
  label,
  scale = 1,
  unit = "",
  boolean: isBoolean = false,
  eventLabel = "eventos",
  levels,
  color = "#38bdf8",
}: Props) {
  const own = readings.filter((reading) => reading.code === code);

  const rawPoints = own
    .map((reading) => ({
      ts: Date.parse(reading.recordedAt),
      value: Number(reading.value) / scale,
    }))
    .filter((point) => Number.isFinite(point.value));
  const points = downsample(rawPoints).map((p) =>
    levels ? { ...p, value: Math.round(p.value) } : p,
  );

  const events = own
    .filter((reading) => reading.value === "true")
    .map((reading) => Date.parse(reading.recordedAt));

  if (own.length === 0 || (!isBoolean && points.length === 0)) return null;

  const all = own.map((reading) => Date.parse(reading.recordedAt));
  const span = Math.max(...all) - Math.min(...all);
  const tickFormatter = makeTickFormatter(span);
  const bars = isBoolean ? bucketCount(events) : null;

  const xAxis = (
    <XAxis
      dataKey="ts"
      type="number"
      scale="time"
      domain={[Math.min(...all), Math.max(...all)]}
      tickFormatter={tickFormatter}
      tick={{ fontSize: 11 }}
      stroke="#9ca3af"
      ticks={evenTicks(Math.min(...all), Math.max(...all))}
      interval="preserveStartEnd"
    />
  );
  const grid = (
    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.4} />
  );

  return (
    <div className="flex flex-col gap-2 rounded-md bg-gray-800 p-3">
      <h3 className="text-sm font-semibold">{label}</h3>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {bars ? (
            <BarChart data={bars.data}>
              {grid}
              {xAxis}
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                labelFormatter={(value) => formatTime(Number(value))}
                formatter={(value) => [
                  `${value} ${eventLabel}`,
                  bars.bucketMs < 86_400_000 ? "por hora" : "por dia",
                ]}
                contentStyle={tooltipStyle}
                cursor={{ fill: "#374151", opacity: 0.4 }}
              />
              <Bar dataKey="count" fill={color} />
            </BarChart>
          ) : (
            <LineChart data={points}>
              {grid}
              {xAxis}
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                unit={unit}
                domain={levels ? [1, levels.length] : ["auto", "auto"]}
                ticks={levels?.map((_, i) => i + 1)}
                tickFormatter={levels ? (v) => levels[v - 1] : undefined}
                width={levels ? 52 : 48}
              />
              <Tooltip
                labelFormatter={(value) => formatTime(Number(value))}
                formatter={(value) => [
                  levels
                    ? levels[Number(value) - 1]
                    : `${Number(value).toFixed(1)}${unit}`,
                  label,
                ]}
                contentStyle={tooltipStyle}
              />
              <Line
                type={levels ? "stepAfter" : "monotone"}
                dataKey="value"
                name={label}
                stroke={color}
                dot={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
