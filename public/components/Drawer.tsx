import React, { ReactNode } from "react";

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
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  direction = "right",
  size = "meddium",
  removePadding,
  customContainerClassNames,
}: Props) {
  return (
    <div
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
