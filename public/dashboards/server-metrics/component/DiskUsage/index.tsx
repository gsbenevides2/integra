import React from "react";

import type { DiskSnapshot } from "@server/db/schema";

function usageColor(percent: number) {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 75) return "bg-orange-400";
  return "bg-green-500";
}

export function DiskUsage({ disks }: { disks: DiskSnapshot[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-gray-800 p-3">
      <h3 className="text-sm font-semibold">Uso de disco</h3>
      {disks.length === 0 ? (
        <p className="text-xs text-mist-400">Sem dados de disco ainda.</p>
      ) : (
        disks.map((disk) => (
          <div key={disk.filesystem} className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="truncate">
                {disk.filesystem} ({disk.mountedAt})
              </span>
              <span className="text-mist-400">
                {disk.usedMb.toFixed(1)} / {disk.totalMb.toFixed(1)} (
                {disk.usagePercent.toFixed(0)}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
              <div
                className={`
                  h-full rounded-full
                  ${usageColor(disk.usagePercent)}
                `}
                style={{ width: `${Math.min(disk.usagePercent, 100)}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
