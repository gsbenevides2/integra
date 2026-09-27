import React from "react";

export function CardSkeleton() {
  return (
    <div
      className="
        flex animate-pulse flex-col gap-1 rounded-md bg-gray-800 p-2 text-sm
      "
    >
      <div className="flex items-center gap-2">
        <div className="size-3.5 rounded-full bg-gray-700" />
        <div className="h-3.5 w-20 rounded-sm bg-gray-700" />
      </div>
      <div className="h-3.5 w-36 rounded-sm bg-gray-700" />
      <div className="mt-1 flex flex-col gap-1.5">
        <div className="h-3.5 w-28 rounded-sm bg-gray-700" />
      </div>
    </div>
  );
}
