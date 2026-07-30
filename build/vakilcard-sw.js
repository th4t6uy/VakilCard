/* VakilCard PWA service worker — implements the AppLinx platform service-
   worker contract (applinx/docs/SERVICE_WORKER.md) for installed cards:
     * code and assets ONLY — no API/data caching (data caching in a SW is
       the "fake offline" anti-pattern the AppLinx platform forbids)
     * app shell (the /ds design-system runtime) precached on install,
       refreshed stale-while-revalidate (DS assets are not content-hashed)
     * card pages: network-first, last known render kept for offline launch
       (only responses the SSR endpoint marks X-VakilCard are ever cached)
     * update protocol: SKIP_WAITING message — identical to
       @applinx/next registerServiceWorker(); the wiring layer (mount.js)
       activates updates in the background, never force-reloading mid-view
   When vakilpedia.com moves to Next.js this file is superseded by the
   @applinx/next Workbox setup; the registration contract stays the same. */

const SW_VERSION = "vc-sw-v1";
const SHELL_CACHE = "vc-shell-" + SW_VERSION;
const PAGE_CACHE = "vc-pages-" + SW_VERSION;

const SHELL_ASSETS = [
  "/ds/styles.css",
  "/ds/page.css",
  "/ds/tokens/colors.css",
  "/ds/tokens/typography.css",
  "/ds/tokens/spacing.css",
  "/ds/tokens/effects.css",
  "/ds/tokens/themes.css",
  "/ds/tokens/fonts.css",
  "/ds/react.production.min.js",
  "/ds/react-dom.production.min.js",
  "/ds/_ds_bundle.js",
  "/ds/ui_kits/vakilcard/VakilCardApp.js",
  "/ds/mount.js",
  "/ds/assets/logos/vakilpedia.png",
  "/vakilcard-pwa-192.png",
  "/vakilcard-pwa-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      // A failed precache must not brick installation — assets also fill
      // lazily via the fetch handler below.
      .catch(function () {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => /^vc-(shell|pages)-/.test(k) && k !== SHELL_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// App-controlled update (AppLinx contract): the page decides when the new
// version activates. Never skipWaiting() automatically on install.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function staleWhileRevalidate(request) {
  return caches.open(SHELL_CACHE).then((cache) =>
    cache.match(request, { ignoreSearch: true }).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
}

function cardNavigation(request) {
  const url = new URL(request.url);
  const key = url.origin + url.pathname; // one cached render per card URL
  return fetch(request)
    .then((response) => {
      // Cache only what the SSR endpoint explicitly marks as a live card —
      // marketing/SPA/wizard navigations are never cached here.
      if (response && response.ok && response.headers.get("X-VakilCard") === "live") {
        const copy = response.clone();
        caches.open(PAGE_CACHE).then((cache) => cache.put(key, copy));
      }
      return response;
    })
    .catch(() =>
      caches.match(key).then(
        (cached) =>
          cached ||
          new Response(
            "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Offline</title></head>" +
              "<body style='font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#050508;color:#fff'>" +
              "<div style='text-align:center;padding:24px'><h1 style='font-weight:900'>You're offline</h1>" +
              "<p style='color:#94a3b8'>This card will load the next time you're connected.</p></div></body></html>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
          )
      )
    );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase/API hosts

  // Data/API stays on the network — IndexedDB/runtime territory per AppLinx.
  if (url.pathname.startsWith("/api/")) return;

  if (
    url.pathname.startsWith("/ds/") ||
    url.pathname === "/vakilcard-pwa-192.png" ||
    url.pathname === "/vakilcard-pwa-512.png"
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(cardNavigation(request));
  }
});
