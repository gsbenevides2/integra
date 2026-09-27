import React from "react";

import {
  CheckCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { IconButton } from "./IconButton";
import { type ToastType, useToast } from "./ToastContext";

const typeClasses: Record<ToastType, string> = {
  success: "border-green-700",
  error: "border-red-700",
};

const typeIcons: Record<ToastType, typeof CheckCircleIcon> = {
  success: CheckCircleIcon,
  error: XCircleIcon,
};

export { ToastProvider, useToast } from "./ToastContext";

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  return (
    <div className="
      fixed right-4 bottom-4 z-100 flex w-full max-w-xs flex-col gap-2
    ">
      {toasts.map((toast) => {
        const Icon = typeIcons[toast.type];
        return (
          <div
            key={toast.id}
            className={`
              border-l-4 bg-gray-800
              ${typeClasses[toast.type]}
              flex items-center gap-2 rounded-md p-3 text-sm shadow-xl
            `}
          >
            <Icon className="size-5 shrink-0" />
            <p className="grow">{toast.message}</p>
            <IconButton
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="
                shrink-0
                hover:bg-gray-700
              "
            >
              <XMarkIcon className="size-4" />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
