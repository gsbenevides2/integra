import React, { ReactNode, useEffect } from "react";

import { XMarkIcon } from "@heroicons/react/24/outline";

import { IconButton } from "./IconButton";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  direction?: "left" | "right";
  size?: "meddium" | "large" | "small";
  removePadding?: boolean;
  customContainerClassNames?: string;
  /** Called by the swipe-open gesture (required for it to work). */
  onOpen?: () => void;
  enableSwipeOpen?: boolean;
  enableSwipeClose?: boolean;
}

const SWIPE_MIN = 60;
// Skip the outermost px: the browser's back/forward gesture owns them.
const EDGE_MIN = 25;
const EDGE_MAX = 120;
const CLOSE_COOLDOWN = 600;
let lastClosedAt = 0; // shared by all Drawer instances

export function Drawer({
  isOpen,
  onClose,
  onOpen,
  enableSwipeOpen,
  enableSwipeClose,
  title,
  children,
  direction = "right",
  size = "meddium",
  removePadding,
  customContainerClassNames,
}: Props) {
  useEffect(() => {
    if (isOpen) return () => void (lastClosedAt = Date.now());
  }, [isOpen]);

  useEffect(() => {
    if (!(enableSwipeOpen && onOpen) && !enableSwipeClose) return;
    // Left drawer: swipe right opens, swipe left closes. Right drawer: inverse.
    const sign = direction === "left" ? 1 : -1;
    let start: { x: number; y: number; othersOpen: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      start = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        // another drawer is open: this swipe belongs to it, not to us
        // (or one was closed a moment ago, by this same swipe or a follow-up)
        othersOpen:
          !isOpen &&
          (!!document.querySelector("[data-drawer-open]") ||
            Date.now() - lastClosedAt < CLOSE_COOLDOWN),
      };
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const dx = (e.changedTouches[0].clientX - start.x) * sign;
      const dy = e.changedTouches[0].clientY - start.y;
      // distance from the drawer's side
      const gap = direction === "left" ? start.x : window.innerWidth - start.x;
      const fromEdge =
        gap >= EDGE_MIN && gap <= EDGE_MAX && !start.othersOpen;
      start = null;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (!isOpen && enableSwipeOpen && fromEdge && dx > 0) onOpen?.();
      else if (isOpen && enableSwipeClose && dx < 0) onClose();
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isOpen, direction, enableSwipeOpen, enableSwipeClose, onOpen, onClose]);

  return (
    <div
      data-drawer-open={isOpen || undefined}
      className={`
        fixed inset-0 z-40
        ${isOpen ? "" : "pointer-events-none"}
      `}
    >
      <div
        className={`
          absolute inset-0 bg-black/50 transition-opacity
          ${isOpen ? `opacity-100` : `opacity-0`}
        `}
        onClick={onClose}
      />
      <div
        className={`
          absolute top-0
          ${direction === "right" ? "right-0" : "left-0"}
          ${
            size === "meddium"
              ? "max-w-md"
              : size === "small"
                ? "max-w-90"
                : `max-w-xl`
          }
          size-full overflow-y-auto border-l border-gray-700 bg-gray-900
          shadow-2xl transition-transform
          ${
            isOpen
              ? "translate-x-0"
              : direction === "right"
                ? "translate-x-full"
                : "-translate-x-full"
          }
        `}
      >
        <div
          className="
            sticky top-0 z-2 flex items-center justify-between border-b
            border-gray-700 bg-gray-900 p-4
          "
        >
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton onClick={onClose} aria-label="Fechar">
            <XMarkIcon className="size-5" />
          </IconButton>
        </div>
        <div
          className={`
            flex flex-col gap-4
            ${removePadding ? "" : "p-4"}
            ${customContainerClassNames}
          `}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
