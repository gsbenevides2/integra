import React, { useState } from "react";

import { VideoCameraIcon } from "@heroicons/react/24/outline";

export function CameraCard({ name }: { name: string }) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <a
      href={`/api/frigate/cameras/${name}/goToFrigate`}
      target="_blank"
      rel="noopener noreferrer"
      className="relative block aspect-video overflow-hidden rounded-md"
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
        aria-label={name}
        autoPlay
        muted
        playsInline
        onLoadedData={() => setIsLoaded(true)}
        className={`
          relative size-full object-cover transition-opacity duration-300
          ${isLoaded ? "opacity-100" : "opacity-0"}
        `}
      />
    </a>
  );
}
