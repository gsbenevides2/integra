import { useEffect, useState } from "react";

import { getFrigateEdenClient } from "../tuya/client";

const POLL_MS = 15_000;

export interface Stats {
  cameras: Record<
    string,
    { fps: number; skippedFps: number; detectionFps: number; detecting: boolean }
  >;
  detector: { name: string; inferenceMs: number } | null;
  disk: { total: number; used: number; free: number } | null;
  gpu: { name: string; usage: string; memory: string } | null;
  memory: { name: string; total: number; used: number }[];
  version: string;
  latestVersion: string;
  uptime: number;
}

export function useFrigateStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const load = () =>
      getFrigateEdenClient()
        .api.frigate.stats.get()
        .then(({ data }) => {
          setFailed(!data);
          if (data) setStats(data as Stats);
        });
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);
  return { stats, failed };
}
