/* Vakilpedia service worker — v4 (2026-10-01): a new build always shows up.
 *
 * One file, shipped unchanged into every Vakilpedia app.
 *
 * What it does:
 * 1. Makes the app installable (Chrome on Android fires `beforeinstallprompt`
 *    only when a service worker with a `fetch` handler controls the page).
 * 2. Pages: network first. Every page that loads successfully is kept on the
 *    phone, so with no signal the same page opens from the phone instead of
 *    the browser's error screen. A page never opened before falls back to
 *    /offline.html — but only when there really is no connection.
 * 3. Slow server (no answer in 8 s) while the phone is online: the saved copy
 *    is shown so nobody stares at a blank screen, the real request keeps
 *    going, and when it lands the page is told ({type:'vp-fresh-page'}) so it
 *    can switch to the new version (OfflineBar does this). A page with no
 *    saved copy simply keeps waiting for the server.
 *    Why (1 Oct 2026): v3 showed the saved copy on a slow answer and stopped
 *    there. Right after a deploy the server is slow, so a reload kept showing
 *    the OLD build and only a private window (no worker) got the new one.
 * 4. App files (scripts, styles, fonts, icons): kept after first use and
 *    served from the phone — versioned by the build. The store is capped so
 *    old builds' files don't pile up for ever.
 * 5. Read-only data files (same-origin .json outside /api, e.g. BareLex's
 *    acts): shown from the phone instantly and refreshed in the background.
 * 6. Pages hold a signed-in person's data, so they are wiped: on any visit to
 *    a sign-in / sign-out page, and when the app posts
 *    {type:'vp-clear-user-data'}.
 * 7. Repair link: opening /vp-repair on any app deletes everything this
 *    worker saved, removes the worker and goes back to the home page. It
 *    does NOT sign anyone out and does NOT touch changes waiting to sync
 *    (those live in the app's own database, not here).
 *
 * Never kept: /api/*, /auth/*, anything that isn't a GET, other websites,
 * Next.js data requests (RSC). When one of those fails offline, Next.js falls
 * back to a normal page load, which step 2 then answers from the phone.
 *
 * The app can ask for pages to be saved ahead of time with
 * {type:'vp-warm', urls:[...]} (CaseLinx does this for the dashboard and the
 * cases with hearings coming up).
 *
 * Changing VERSION makes every browser drop everything older on its next
 * visit. Bump it whenever this file's caching rules change.
 */
const VERSION = 'vp-v4';
const SHELL = VERSION + '-shell';
const PAGES = VERSION + '-pages';
const DATA = VERSION + '-data';
const ASSET = /\.(?:png|jpg|jpeg|webp|svg|ico|gif|woff2?|ttf|css|js|mjs)$/i;
const MAX_PAGES = 120;
const MAX_FILES = 600;
const PAGE_TIMEOUT_MS = 8000;
// A saved copy younger than this is close enough to current that swapping it
// for the server's answer isn't worth interrupting anyone (also stops a
// reload loop when the server is slow every time).
const FRESH_NOTICE_MIN_AGE_MS = 2 * 60 * 1000;
const SAVED_AT = 'x-vp-saved-at';
const REPAIR_PATH = '/vp-repair';
const KEEP = ['/offline.html', '/icons/icon-192.png'];
// Single-page apps (BareLex, VakilCard) register as /sw.js?spa=1: every route
// there is the same app shell, so an unsaved route can open from the saved
// home page and the app's own router takes over.
const SPA = new URL(self.location.href).searchParams.has('spa');
const SIGN_PATH = /\/(?:auth\/)?(?:sign-?in|sign-?out|log-?in|log-?out|signin|signout)(?:\/|$|\?)/i;

// Pages whose newer version arrived after the saved copy was shown, so a page
// that wasn't listening yet can still ask ({type:'vp-fresh?'}).
const freshReady = new Map();

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => Promise.all(KEEP.map((u) => c.add(u).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function clearUserData() {
  freshReady.clear();
  return Promise.all([caches.delete(PAGES), caches.delete(DATA)]);
}

function pageKey(url) {
  // One copy per path+query; hash never reaches the server.
  const u = new URL(url);
  u.hash = '';
  return u.toString();
}

async function trim(name, max, keep) {
  const c = await caches.open(name);
  const keys = await c.keys(); // oldest first
  const removable = keep ? keys.filter((k) => !keep.includes(new URL(k.url).pathname)) : keys;
  const extra = removable.length - max;
  if (extra > 0) await Promise.all(removable.slice(0, extra).map((k) => c.delete(k)));
}

function isHtml(res) {
  return (res.headers.get('Content-Type') || '').includes('text/html');
}

async function storePage(url, res) {
  if (!res || !res.ok || res.type !== 'basic' || !isHtml(res)) return;
  const headers = new Headers(res.headers);
  headers.set(SAVED_AT, String(Date.now()));
  const body = await res.blob();
  const c = await caches.open(PAGES);
  await c.put(pageKey(url), new Response(body, { status: res.status, statusText: res.statusText, headers }));
  trim(PAGES, MAX_PAGES).catch(() => {});
}

async function savedPage(url) {
  const pages = await caches.open(PAGES);
  const key = pageKey(url);
  const hit = (await pages.match(key)) || (await pages.match(key, { ignoreSearch: true }));
  if (hit) return hit;
  if (SPA) return (await pages.match(new URL('/', self.location.origin).toString())) || null;
  return null;
}

async function offlinePage() {
  const offline = await caches.match('/offline.html');
  return offline || new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } });
}

async function tellPages(url) {
  const key = pageKey(url);
  freshReady.set(key, Date.now());
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  wins.forEach((w) => w.postMessage({ type: 'vp-fresh-page', url: key }));
}

const REPAIR_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta http-equiv="refresh" content="1;url=/"><title>Refreshed</title></head>' +
  '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#f1f5f9;' +
  'font:500 16px/1.5 system-ui,-apple-system,sans-serif;text-align:center;padding:24px">' +
  '<div><div style="font-size:40px">&#10003;</div><p style="margin:8px 0 4px;font-weight:700">App refreshed</p>' +
  '<p style="margin:0;opacity:.75">Loading the latest version&hellip;</p>' +
  '<p style="margin:16px 0 0"><a href="/" style="color:#93c5fd">Continue</a></p></div></body></html>';

async function repair() {
  freshReady.clear();
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  await self.registration.unregister();
  return new Response(REPAIR_HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function handleNavigate(e) {
  const req = e.request;
  const url = new URL(req.url);
  if (url.pathname === REPAIR_PATH) return repair();
  if (SIGN_PATH.test(url.pathname)) {
    await clearUserData().catch(() => {});
    return fetch(req);
  }

  let stored = Promise.resolve();
  const network = fetch(req).then((res) => {
    stored = storePage(req.url, res.clone()).catch(() => {});
    return res;
  });

  // The phone itself says there is no connection: don't make anyone wait.
  if (self.navigator && self.navigator.onLine === false) {
    const saved = await savedPage(req.url);
    if (saved) {
      network.catch(() => {});
      return saved;
    }
  }

  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(() => resolve('slow'), PAGE_TIMEOUT_MS);
  });
  try {
    const first = await Promise.race([network, slow]);
    clearTimeout(timer);
    if (first !== 'slow') return first;

    // Online but the server is slow (typically just after a deploy).
    const saved = await savedPage(req.url);
    if (!saved) return await network; // nothing to show yet: keep waiting
    const age = Date.now() - Number(saved.headers.get(SAVED_AT) || 0);
    e.waitUntil(
      network
        .then(async (res) => {
          // Save the new copy BEFORE telling the page, so its reload gets it
          // even if the server is still slow.
          await stored;
          // Only a real page we just saved counts (a redirect isn't saved, so
          // reloading would show the same old copy again).
          if (res.ok && res.type === 'basic' && isHtml(res) && age > FRESH_NOTICE_MIN_AGE_MS) {
            await tellPages(req.url);
          }
        })
        .catch(() => {})
    );
    return saved;
  } catch (err) {
    clearTimeout(timer);
    return (await savedPage(req.url)) || offlinePage();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    if (url.pathname.startsWith('/api/')) return;
    e.respondWith(handleNavigate(e));
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
              e.waitUntil(
                caches
                  .open(SHELL)
                  .then((c) => c.put(req, copy))
                  .then(() => trim(SHELL, MAX_FILES, KEEP))
                  .catch(() => {})
              );
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
  if (msg.type === 'vp-fresh?' && typeof msg.url === 'string' && e.source) {
    const key = pageKey(msg.url);
    const at = freshReady.get(key);
    if (at && Date.now() - at < 5 * 60 * 1000) {
      freshReady.delete(key);
      e.source.postMessage({ type: 'vp-fresh-page', url: key });
    }
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
