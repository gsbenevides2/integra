import React, { type ReactElement, type ReactNode } from "react";

import { ConfirmDialog, ConfirmProvider } from "@public/components/Confirm";
import { ToastContainer, ToastProvider } from "@public/components/Toast";

import { render } from "@testing-library/react";

/** Toast + Confirm providers, with their UI mounted so toasts/dialogs are queryable. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        {children}
        <ConfirmDialog />
        <ToastContainer />
      </ConfirmProvider>
    </ToastProvider>
  );
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: Providers });
}
