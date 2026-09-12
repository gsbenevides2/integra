/**
 * Service worker for the Integra PWA.
 *
 * Installability aside, the only caching that is safe here is caching that can never show
 * stale *control* state: this dashboard turns real lamps on and off. So API responses are
 * deliberately left alone — the worker touches the HTML shell and the static assets, and
 * passes everything else straight through to the network.
 */

interface ExtendableEventLike extends Event {
    waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends ExtendableEventLike {
    readonly request: Request;
    respondWith(response: Response | Promise<Response>): void;
}

interface ServiceWorkerScope {
    addEventListener(
        type: "install" | "activate",
        listener: (event: ExtendableEventLike) => void,
    ): void;
    addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
    skipWaiting(): Promise<void>;
    clients: { claim(): Promise<void> };
    registration: { scope: string };
}

const sw = globalThis as unknown as ServiceWorkerScope;

const SHELL_CACHE = "integra-shell-v1";
const ASSET_CACHE = "integra-assets-v1";
const OWNED_CACHES = [SHELL_CACHE, ASSET_CACHE];

sw.addEventListener("install", (event) => {
    // Nothing to precache: every asset URL carries a per-deploy `?v=` stamp that only the
    // rendered HTML knows, so the asset cache is filled on first use instead.
    event.waitUntil(sw.skipWaiting());
});

sw.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(
                names
                    .filter((name) => !OWNED_CACHES.includes(name))
                    .map((name) => caches.delete(name)),
            );
            await sw.clients.claim();
        })(),
    );
});

sw.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== new URL(sw.registration.scope).origin) return;

    if (request.mode === "navigate") {
        event.respondWith(networkFirst(request, SHELL_CACHE));
        return;
    }

    if (url.pathname.startsWith("/assets/")) {
        event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    }
});

/**
 * Used for the document itself: the dashboard must never open showing yesterday's markup, so
 * the network always wins when it is reachable. The cached copy exists purely so that an
 * offline launch shows the app shell instead of the browser's error page.
 */
async function networkFirst(request: Request, cacheName: string): Promise<Response> {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    }
}

/**
 * Used for `/assets/*`, whose URLs are already version-stamped: a hit can be served from
 * cache without risking staleness, because a new deploy asks for a different URL entirely.
 */
async function staleWhileRevalidate(request: Request, cacheName: string): Promise<Response> {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const fromNetwork = fetch(request).then(async (response) => {
        if (response.ok) {
            await cache.put(request, response.clone());
            await dropOtherVersions(cache, request);
        }
        return response;
    });

    if (!cached) return fromNetwork;
    void fromNetwork.catch(() => undefined);
    return cached;
}

/**
 * Every deploy mints a fresh `?v=` for the same file, so without this the asset cache would
 * grow by one full copy of the bundle per deploy and never shrink.
 */
async function dropOtherVersions(cache: Cache, request: Request): Promise<void> {
    const current = new URL(request.url);
    const keys = await cache.keys();
    await Promise.all(
        keys
            .filter((key) => {
                const keyUrl = new URL(key.url);
                return keyUrl.pathname === current.pathname && keyUrl.search !== current.search;
            })
            .map((key) => cache.delete(key)),
    );
}
