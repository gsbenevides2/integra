function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateTime(
  date: Date,
  { withYear = false, withSeconds = false } = {},
): string {
  const datePart = withYear
    ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
    : `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  const timePart = withSeconds
    ? `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${datePart} ${timePart}`;
}

/** A lightweight stand-in for date-fns's formatDistanceStrict — largest whole unit only. */
export function formatDuration(fromMs: number, toMs: number): string {
  const diff = Math.abs(toMs - fromMs);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(diff / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"}`;
}
