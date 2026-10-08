import {
  bucketCount,
  downsample,
  evenTicks,
  formatTime,
  makeTickFormatter,
  tooltipStyle,
} from "@public/dashboards/tuya/component/chartUtils";

import { expect, test } from "bun:test";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test("formatTime accepts numbers and strings", () => {
  const ts = Date.UTC(2024, 0, 15, 12, 0);
  expect(formatTime(ts)).toBe(formatTime(new Date(ts).toISOString()));
  expect(formatTime(ts)).toContain("/");
  expect(tooltipStyle.fontSize).toBe(12);
});

test("makeTickFormatter shows time for short spans and date for long", () => {
  const ts = Date.UTC(2024, 0, 15, 12, 30);
  expect(makeTickFormatter(HOUR)(ts)).toContain(":");
  expect(makeTickFormatter(5 * DAY)(ts)).not.toContain(":");
});

test("bucketCount buckets by hour or day", () => {
  expect(bucketCount([])).toEqual({ data: [], bucketMs: HOUR });
  const hourly = bucketCount([2 * HOUR + 5, 2 * HOUR + 9, HOUR]);
  expect(hourly.bucketMs).toBe(HOUR);
  expect(hourly.data).toEqual([
    { ts: HOUR, count: 1 },
    { ts: 2 * HOUR, count: 2 },
  ]);
  expect(bucketCount([0, 10 * DAY]).bucketMs).toBe(DAY);
});

test("evenTicks", () => {
  expect(evenTicks(5, 5)).toEqual([5]);
  expect(evenTicks(0, 30)).toEqual([0, 10, 20, 30]);
  expect(evenTicks(0, 10, 3)).toEqual([0, 5, 10]);
});

test("downsample", () => {
  const few = [{ ts: 1, value: 1 }];
  expect(downsample(few)).toBe(few);
  const many = Array.from({ length: 100 }, (_, i) => ({ ts: i, value: i }));
  const out = downsample(many, 10);
  expect(out.length).toBe(10);
  expect(out[0]!.value).toBeLessThan(out[9]!.value);
  // identical timestamps: zero width falls back to 1
  const same = Array.from({ length: 5 }, () => ({ ts: 7, value: 2 }));
  expect(downsample(same, 2)).toEqual([{ ts: 7.5, value: 2 }]);
});
