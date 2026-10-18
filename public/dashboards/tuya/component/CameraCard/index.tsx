import React, { useState } from "react";

import { VideoCameraIcon } from "@heroicons/react/24/outline";

export function CameraCard({
  name,
  online,
  onOpen,
}: {
  name: string;
  online?: boolean;
  onOpen: () => void;
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={name}
      className="
        relative block aspect-video cursor-pointer overflow-hidden rounded-md
      "
    >
      <div
        aria-hidden
        className={`
          absolute inset-0 flex animate-pulse items-center justify-center
          bg-gray-800 text-mist-500 transition-opacity duration-300
          ${isLoaded ? "opacity-0" : "opacity-100"}
        `}
      >
        <VideoCameraIcon className="size-10" />
      </div>
      <video
        src={`/api/frigate/cameras/${name}/stream`}
        poster={`/api/frigate/cameras/${name}/latest.jpg`}
        autoPlay
        muted
        playsInline
        onLoadedData={() => setIsLoaded(true)}
        className={`
          relative size-full object-cover transition-opacity duration-300
          ${isLoaded ? "opacity-100" : "opacity-0"}
        `}
      />
      {online !== undefined && (
        <span
          role="status"
          aria-label={online ? "Câmera online" : "Câmera sem sinal"}
          className={`
            absolute top-2 right-2 size-2.5 rounded-full
            ${online ? "bg-green-500" : "bg-red-500"}
          `}
        />
      )}
    </button>
  );
}
