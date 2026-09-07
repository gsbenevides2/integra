import React from "react";
import { hydrateRoot } from "react-dom/client";
import { App } from "./App";

// Connects client-side React logic to the server HTML
hydrateRoot(document.getElementById("root") as Element, <App />);
