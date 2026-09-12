/**
 * Registers the PWA service worker, which is what makes the browser offer to install Integra.
 *
 * `navigator.serviceWorker` only exists in a secure context — HTTPS, or localhost. Reached
 * over plain HTTP on a LAN address the property is simply absent, the worker never registers
 * and no install prompt appears; see `docs/pwa.md` for how to put the app behind TLS.
 */
export function registerServiceWorker(): void {
    if (!("serviceWorker" in navigator)) return;

    // Registering competes with the dashboard's first data fetches for connections, and
    // nothing on screen depends on it, so it waits until the page has finished loading.
    const register = () => {
        void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
            console.error("Service worker registration failed", error);
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
}
