import { formatDateTime, formatDuration } from "@public/dashboards/train-status/formatDate";

import { describe, expect, test } from "bun:test";

describe("formatDateTime", () => {
  const d = new Date(2024, 0, 2, 3, 4, 5);
  test("variants", () => {
    expect(formatDateTime(d)).toBe("02/01 03:04");
    expect(formatDateTime(d, { withYear: true })).toBe("02/01/2024 03:04");
    expect(formatDateTime(d, { withSeconds: true })).toBe("02/01 03:04:05");
    expect(formatDateTime(d, { withYear: true, withSeconds: true })).toBe("02/01/2024 03:04:05");
  });
});

describe("formatDuration", () => {
  const m = 60_000;
  test("units and pluralisation", () => {
    expect(formatDuration(0, 10_000)).toBe("less than a minute");
    expect(formatDuration(0, m)).toBe("1 minute");
    expect(formatDuration(m * 5, 0)).toBe("5 minutes");
    expect(formatDuration(0, 60 * m)).toBe("1 hour");
    expect(formatDuration(0, 5 * 60 * m)).toBe("5 hours");
    expect(formatDuration(0, 24 * 60 * m)).toBe("1 day");
    expect(formatDuration(0, 3 * 24 * 60 * m)).toBe("3 days");
  });
});
