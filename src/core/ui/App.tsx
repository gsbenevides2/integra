import { useState } from "react";
import { SideBar } from "./components/sidebar";
import { dashboards } from "extensions/dashboards";
import { Content } from "./components/content";

export function App() {
    const [selectedDash, setSelectedDash] = useState(dashboards.at(0)?.id);
    return (
        <html lang="pt">
            <head>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Integra</title>
                <link rel="stylesheet" href="/assets/output.css" />
                <link rel="icon" type="image/x-icon" href="/favicon.ico" />
                <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
                <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
                <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
                <link rel="manifest" href="/site.webmanifest" />
            </head>
            <body id="root">
                <main className="grid grid-cols-[280px_auto]">
                    <SideBar updateDash={setSelectedDash} />
                    <Content selectedDash={selectedDash} />
                </main>
            </body>
        </html>
    );
}
