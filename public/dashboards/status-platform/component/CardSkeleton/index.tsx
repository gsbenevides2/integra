import React from "react";

export function CardSkeleton() {
  return (
    <div className="
      flex animate-pulse flex-col gap-1 rounded-md bg-gray-800 p-2 text-sm
    ">
      <div className="flex justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3.5 w-32 rounded-sm bg-gray-700" />
          <div className="h-3.5 w-44 rounded-sm bg-gray-700" />
          <div className="h-3.5 w-24 rounded-sm bg-gray-700" />
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="size-6.5 rounded-full bg-gray-700" />
          <div className="size-6.5 rounded-full bg-gray-700" />
          <div className="size-6.5 rounded-full bg-gray-700" />
        </div>
      </div>
      <div className="mt-1 flex flex-col gap-1.5">
        <div className="h-3.5 w-28 rounded-sm bg-gray-700" />
        <div className="h-3.5 w-36 rounded-sm bg-gray-700" />
      </div>
    </div>
  );
}
