import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./routeTree";
// Import early so the beforeinstallprompt listener is registered before any UI
// mounts and can capture the browser's one-shot install event.
import "./utils/installPrompt";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <RouterProvider router={router} />
    </React.StrictMode>
);
