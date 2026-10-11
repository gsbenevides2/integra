import "@public/styles/global.css";

import React from "react";
import { createRoot } from "react-dom/client";

import { ConfirmDialog, ConfirmProvider } from "@public/components/Confirm";
import { MeProvider } from "@public/components/MeContext";
import { ToastContainer, ToastProvider } from "@public/components/Toast";

import { GlobalDrawerProvider } from "./components/GlobalDrawerContext";
import { instrumentFrontend } from "./instrumentFrontend";
import { registerServiceWorker } from "./registerServiceWorker";

instrumentFrontend();

function App() {
  return (
    <MeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <GlobalDrawerProvider>
            <ConfirmDialog />
            <ToastContainer />
          </GlobalDrawerProvider>
        </ConfirmProvider>
      </ToastProvider>
    </MeProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

registerServiceWorker();
