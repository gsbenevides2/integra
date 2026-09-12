import React from "react";
import { hydrateRoot } from "react-dom/client";
import { App } from "./App";
import { registerServiceWorker } from "./registerServiceWorker";

// App renders the full <html> document, so hydration must target
// `document` itself, not an element inside <body>.
hydrateRoot(document, <App />);

registerServiceWorker();
