import React from "react";

export function CameraCard({ name }: { name: string }) {
  return (
    <a
      href={`/api/frigate/cameras/${name}/goToFrigate`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <video
        src={`/api/frigate/cameras/${name}/stream`}
        aria-label={name}
        autoPlay
        muted
        playsInline
        className="aspect-video w-full rounded-md object-cover"
      />
    </a>
  );
}
