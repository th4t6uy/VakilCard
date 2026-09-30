/* Vakilpedia service worker — v3 (2026-09-30): the app keeps working offline.
 *
 * One file, shipped unchanged into every Vakilpedia app.
 *
 * What it does:
 * 1. Makes the app installable (Chrome on Android fires `beforeinstallprompt`
 *    only when a service worker with a `fetch` handler controls the page).
 * 2. Pages: network first (8 s cap). Every page that loads successfully is
 *    kept on the phone, so with no signal the same page opens from the phone
 *    instead of the browser's error screen. A page never opened before falls
 *    back to /offline.html.
 * 3. App files (scripts, styles, fonts, icons): kept after first use and
 *    served from the phone — they are versioned by the build, so never stale.
 * 4. Read-only data files (same-origin .json outside /api, e.g. BareLex's
 *    acts): shown from the phone instantly and refreshed in the background.
 * 5. Pages hold a signed-in person's data, so they are wiped: on any visit to
 *    a sign-in / sign-out page, when the server redirects a page to sign-in
 *    (the session ended), and when the app posts {type:'vp-clear-user-data'}.
 *
 * Never kept: /api/*, /auth/*, anything that isn't a GET, other websites,
 * Next.js data requests (RSC). When one of those fails offline, Next.js falls
 * back to a normal page load, which step 2 then answers from the phone.
 *
 * The app can ask for pages to be saved ahead of time with
 * {type:'vp-warm', urls:[...]} (CaseLinx does this for the dashboard and the
 * cases with hearings coming up).
 */
const VERSION = 'vp-v3';
const SHELL = VERSION + '-shell';
const PAGES = VERSION + '-pages';
const DATA = VERSION + '-data';
const ASSET = /\.(?:png|jpg|jpeg|webp|svg|ico|gif|woff2?|ttf|css|js|mjs)$/i;
const MAX_PAGES = 120;
const PAGE_TIMEOUT_MS = 8000;
// Single-page apps (BareLex, VakilCard) register as /sw.js?spa=1: every route
// there is the same app shell, so an unsaved route can open from the saved
// home page and the app's own router takes over.
const SPA = new URL(self.location.href).searchParams.has('spa');
const SIGN_PATH = /\/(?:auth\/)?(?:sign-?in|sign-?out|log-?in|log-?out|signin|signout)(?:\/|$|\?)/i;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) =>
      Promise.all(['/offline.html', '/icons/icon-192.png'].map((u) => c.add(u).catch(() => {})))
    )
  );
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

function clearUserData() {
  return Promise.all([caches.delete(PAGES), caches.delete(DATA)]);
}

function pageKey(url) {
  // One copy per path+query; hash never reaches the server.
  const u = new URL(url);
  u.hash = '';
  return u.toString();
}

async function trimPages() {
  const c = await caches.open(PAGES);
  const keys = await c.keys();
  if (keys.length > MAX_PAGES) {
    await Promise.all(keys.slice(0, keys.length - MAX_PAGES).map((k) => c.delete(k)));
  }
}

function isHtml(res) {
  return (res.headers.get('Content-Type') || '').includes('text/html');
}

async function storePage(url, res) {
  if (!res || !res.ok || res.type !== 'basic' || !isHtml(res)) return;
  const c = await caches.open(PAGES);
  await c.put(pageKey(url), res);
  trimPages().catch(() => {});
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (err) => { clearTimeout(t); reject(err); });
  });
}

async function handleNavigate(req) {
  const url = new URL(req.url);
  if (SIGN_PATH.test(url.pathname)) {
    await clearUserData().catch(() => {});
    return fetch(req);
  }
  try {
    const res = await withTimeout(fetch(req), PAGE_TIMEOUT_MS);
    const landed = new URL(res.url || req.url);
    if (res.redirected && (SIGN_PATH.test(landed.pathname) || landed.origin !== url.origin)) {
      // Sent to a sign-in page: this person's session is over.
      clearUserData().catch(() => {});
    } else {
      storePage(req.url, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const pages = await caches.open(PAGES);
    const exact = await pages.match(pageKey(req.url));
    if (exact) return exact;
    const samePath = await pages.match(pageKey(req.url), { ignoreSearch: true });
    if (samePath) return samePath;
    if (SPA) {
      const shell = await pages.match(new URL('/', self.location.origin).toString());
      if (shell) return shell;
    }
    const offline = await caches.match('/offline.html');
    return offline || new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    if (url.pathname.startsWith('/api/')) return;
    e.respondWith(handleNavigate(req));
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Next.js page-data requests: never cached (a failed one falls back to a
  // normal page load, answered above).
  if (req.headers.get('RSC') || url.searchParams.has('_rsc')) return;

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
    return;
  }

  if (/\.json$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(DATA).then(async (c) => {
        const hit = await c.match(req);
        const fresh = fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') c.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => hit || Response.error());
        return hit || fresh;
      })
    );
  }
});

self.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (msg.type === 'vp-clear-user-data') {
    e.waitUntil(clearUserData());
    return;
  }
  if (msg.type === 'vp-warm' && Array.isArray(msg.urls)) {
    e.waitUntil(
      (async () => {
        for (const u of msg.urls.slice(0, 40)) {
          try {
            const url = new URL(u, self.location.origin);
            if (url.origin !== self.location.origin) continue;
            const res = await fetch(url.toString(), { credentials: 'same-origin', redirect: 'follow' });
            if (res.redirected && SIGN_PATH.test(new URL(res.url).pathname)) break; // signed out
            await storePage(url.toString(), res);
          } catch (err) {
            break; // offline or server busy — try again next time
          }
        }
      })()
    );
  }
});
