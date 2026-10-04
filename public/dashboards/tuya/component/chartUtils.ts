const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function formatTime(value: number | string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Short tick label: time-only for spans under 2 days, otherwise date-only. */
export function makeTickFormatter(spanMs: number) {
  return (value: number) =>
    new Date(value).toLocaleString(
      "pt-BR",
      spanMs < 2 * DAY
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "2-digit" },
    );
}

export const tooltipStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  fontSize: 12,
};

/** Counts timestamps per bucket (hour up to 3 days of data, otherwise day). */
export function bucketCount(timestamps: number[]) {
  if (timestamps.length === 0) return { data: [], bucketMs: HOUR };
  const span = Math.max(...timestamps) - Math.min(...timestamps);
  const bucketMs = span <= 3 * DAY ? HOUR : DAY;
  const counts = new Map<number, number>();
  for (const ts of timestamps) {
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const data = [...counts].map(([ts, count]) => ({ ts, count }));
  return { data: data.sort((a, b) => a.ts - b.ts), bucketMs };
}

/** Evenly spaced ticks; recharts' auto ticks on a time axis label every point. */
export function evenTicks(min: number, max: number, count = 4) {
  if (max <= min) return [min];
  return Array.from(
    { length: count },
    (_, i) => min + ((max - min) * i) / (count - 1),
  );
}

/** Averages points into at most `max` equal-width time buckets. */
export function downsample(points: { ts: number; value: number }[], max = 48) {
  if (points.length <= max) return points;
  const min = Math.min(...points.map((p) => p.ts));
  const width = (Math.max(...points.map((p) => p.ts)) - min) / max || 1;
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const k = Math.min(max - 1, Math.floor((p.ts - min) / width));
    const b = buckets.get(k) ?? { sum: 0, n: 0 };
    b.sum += p.value;
    b.n += 1;
    buckets.set(k, b);
  }
  return [...buckets]
    .sort((a, b) => a[0] - b[0])
    .map(([k, b]) => ({ ts: min + (k + 0.5) * width, value: b.sum / b.n }));
}
