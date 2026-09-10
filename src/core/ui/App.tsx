import { useState } from "react";
import { SideBar } from "./components/sidebar";
import { dashboards } from "extensions/dashboards";
import { Content } from "./components/content";
import { ToastProvider, ToastContainer } from "./components/toast";
import { ConfirmProvider, ConfirmDialog } from "./components/confirm";
import { BUILD_ID } from "./buildId";

export function App() {
    const [selectedDash, setSelectedDash] = useState(dashboards.at(0)?.id);
    return (
        <html lang="pt">
            <head>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Integra</title>
                <link rel="stylesheet" href={`/assets/output.css?v=${BUILD_ID}`} />
                <link rel="icon" type="image/x-icon" href="/assets/favicon.ico" />
                <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png" />
                <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16x16.png" />
                <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
                <link rel="manifest" href="/assets/site.webmanifest" />
            </head>
            <body>
                <ToastProvider>
                    <ConfirmProvider>
                        <main className="grid grid-cols-[280px_auto]">
                            <SideBar updateDash={setSelectedDash} />
                            <Content selectedDash={selectedDash} />
                        </main>
                        <ConfirmDialog />
                    </ConfirmProvider>
                    <ToastContainer />
                </ToastProvider>
            </body>
        </html>
    );
}
