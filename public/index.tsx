import "@public/styles/global.css";

import React from "react";
import { createRoot } from "react-dom/client";

import { ConfirmDialog, ConfirmProvider } from "@public/components/Confirm";
import { ToastContainer, ToastProvider } from "@public/components/Toast";

import { GlobalDrawerProvider } from "./components/GlobalDrawerContext";
import { instrumentFrontend } from "./instrumentFrontend";
import { registerServiceWorker } from "./registerServiceWorker";

instrumentFrontend();

function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <GlobalDrawerProvider>
          <ConfirmDialog />
          <ToastContainer />
        </GlobalDrawerProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

registerServiceWorker();
