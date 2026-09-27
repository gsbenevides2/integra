import React, { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: Props) {
  // The dashboard is server-rendered before it hydrates, and a portal needs a real
  // `document` to attach to. Waiting for the first client effect keeps the server output
  // empty — which is what it would be anyway, since the portal renders into document.body
  // rather than into this component's slot.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  if (!isMounted) return null;

  return createPortal(
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center bg-mist-950/90 p-4
        backdrop-blur-sm transition-opacity duration-200
        ${
        isOpen
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }
      `}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`
          flex w-full max-w-md flex-col gap-4 rounded-lg bg-gray-800 p-4
          shadow-xl transition-all duration-200
          ${
          isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }
        `}
      >
        <h3 className="text-base font-semibold">{title}</h3>
        {children}
      </div>
    </div>,
    document.body,
  );
}
