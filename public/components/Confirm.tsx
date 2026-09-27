import React from "react";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { Button } from "./Button";
import { useConfirmState } from "./ConfirmContext";

export { ConfirmProvider, useConfirm } from "./ConfirmContext";

export function ConfirmDialog() {
  const { state, resolve } = useConfirmState();

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center bg-mist-950/90 p-4
        backdrop-blur-sm transition-opacity duration-200
        ${
        state.isOpen
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }
      `}
      onClick={(e) => {
        if (e.target === e.currentTarget) resolve(false);
      }}
    >
      <div
        className={`
          flex w-full max-w-sm flex-col gap-4 rounded-lg bg-gray-800 p-4
          shadow-xl transition-all duration-200
          ${
          state.isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }
        `}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-red-950 p-2 text-red-500">
            <ExclamationTriangleIcon className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold">{state.title}</h3>
            <p className="text-sm text-mist-300">{state.message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => resolve(false)}
          >
            {state.cancelLabel}
          </Button>
          <Button
            type="button"
            className="
              bg-red-800
              hover:bg-red-700
            "
            onClick={() => resolve(true)}
          >
            {state.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
