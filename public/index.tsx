import "@public/styles/global.css";

import React from "react";
import { createRoot } from "react-dom/client";

import { ConfirmDialog, ConfirmProvider } from "@public/components/Confirm";
import { ErrorBoundary } from "@public/components/ErrorBoundary";
import { MeProvider } from "@public/components/MeContext";
import { ToastContainer, ToastProvider } from "@public/components/Toast";
import { VoiceAssistantProvider } from "@public/components/VoiceAssistantContext";
import { VoiceAssistantOverlay } from "@public/components/VoiceAssistantOverlay";

import { ensureCloudflareBypass } from "./cloudflareBypass";
import { GlobalDrawerProvider } from "./components/GlobalDrawerContext";
import { instrumentFrontend } from "./instrumentFrontend";
import { registerServiceWorker } from "./registerServiceWorker";

void instrumentFrontend();

function App() {
  return (
    <MeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <VoiceAssistantProvider>
            <GlobalDrawerProvider>
              <VoiceAssistantOverlay />
              <ConfirmDialog />
              <ToastContainer />
            </GlobalDrawerProvider>
          </VoiceAssistantProvider>
        </ConfirmProvider>
      </ToastProvider>
    </MeProvider>
  );
}

const root = createRoot(document.getElementById("root")!, {
  // A render error caught by ErrorBoundary is reported there (RUM event + trace
  // span, carrying the React component stack). React's default handler only
  // appends a `console.error`, which `forwardErrorsToLogs` in turn turns into a
  // second, poorer error event for the same failure — so it stays quiet.
  onCaughtError: () => undefined,
});
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

registerServiceWorker();
void ensureCloudflareBypass();
