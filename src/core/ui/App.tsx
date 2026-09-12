import { useState } from "react";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { SideBar } from "./components/sidebar";
import { dashboards } from "extensions/dashboards";
import { Content } from "./components/content";
import { ToastProvider, ToastContainer } from "./components/toast";
import { ConfirmProvider, ConfirmDialog } from "./components/confirm";
import { BUILD_ID } from "./buildId";

export function App() {
    const [selectedDash, setSelectedDash] = useState(dashboards.at(0)?.id);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    return (
        <html lang="pt">
            <head>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                {/* Paints the status bar to match the page background once installed. */}
                <meta name="theme-color" content="#030712" />
                <meta name="application-name" content="Integra" />
                {/* iOS reads the manifest only partially, so standalone mode and the home
                    screen label still have to be spelled out with these legacy meta tags. */}
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-title" content="Integra" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black" />
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
                        <main className="md:grid md:grid-cols-[280px_auto]">
                            <button
                                type="button"
                                onClick={() => setIsSidebarOpen(true)}
                                aria-label="Open menu"
                                className="md:hidden fixed top-3 left-3 z-30 flex items-center justify-center size-10 rounded-md bg-gray-800 border border-gray-700"
                            >
                                <Bars3Icon className="size-5" />
                            </button>
                            <SideBar
                                isOpen={isSidebarOpen}
                                onClose={() => setIsSidebarOpen(false)}
                                updateDash={(id) => {
                                    setSelectedDash(id);
                                    setIsSidebarOpen(false);
                                }}
                            />
                            <div className="pt-14 md:pt-0 min-w-0">
                                <Content selectedDash={selectedDash} />
                            </div>
                        </main>
                        <ConfirmDialog />
                    </ConfirmProvider>
                    <ToastContainer />
                </ToastProvider>
            </body>
        </html>
    );
}
