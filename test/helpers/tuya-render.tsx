// GlobalDrawerContext must load before any tuya module: it imports the tuya dashboard,
// which imports components that import it back, and the cycle only resolves in this order.
import "@public/components/GlobalDrawerContext";

import React, { type ReactElement } from "react";

import { ConfirmDialog, ConfirmProvider } from "@public/components/Confirm";
import { ToastContainer, ToastProvider } from "@public/components/Toast";

import { render } from "@testing-library/react";

export function renderTuya(ui: ReactElement) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        {ui}
        <ToastContainer />
        <ConfirmDialog />
      </ConfirmProvider>
    </ToastProvider>,
  );
}
