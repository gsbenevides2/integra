import React, { type ReactNode, useEffect, useRef, useState } from "react";
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

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isMounted) return null;

  return createPortal(
    <div
      inert={!isOpen}
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
        role="dialog"
        aria-modal="true"
        aria-label={isOpen ? title : undefined}
        className={`
          flex w-full max-w-md flex-col gap-4 rounded-lg bg-gray-800 p-4
          shadow-xl transition-all duration-200
          ${
          isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }
        `}
      >
        <h3 className="text-base font-semibold first-letter:uppercase">{title}</h3>
        {children}
      </div>
    </div>,
    document.body,
  );
}
