/* Vakilpedia — the smallest service worker that does a real job.
 *
 * It exists for two reasons and deliberately does nothing else:
 *
 * 1. Chrome on Android refuses to fire `beforeinstallprompt` — no install
 *    banner, no "Add to home screen" in the menu as an app — unless the page
 *    controls a service worker with a `fetch` handler. A manifest alone is
 *    not enough, which is why every app here had a manifest-shaped hole.
 * 2. It gives the installed app a real offline fallback for the shell instead
 *    of a browser error page.
 *
 * It does NOT cache application responses. These are signed-in products whose
 * pages are per-user and change constantly; a stale cached dashboard is worse
 * than a slow one. Only same-origin GETs for static assets are cached, and
 * navigations always go to the network first.
 */
const VERSION = 'vp-v1';
const SHELL = VERSION + '-shell';
const ASSET = /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|css|js)$/i;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/icons/icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network first, always. A cached page of someone else's session, or of
    // yesterday's case list, is the failure mode worth avoiding here.
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  if (ASSET.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res && res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
      )
    );
  }
});
