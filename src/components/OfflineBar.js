'use client';
/**
 * OfflineBar — the small bar at the bottom of the screen when there is no
 * internet (founder request, 30 Sept 2026: courts have areas without signal).
 *
 *   offline, app queues changes (CaseLinx):
 *     "You're offline · Your changes are saved on this phone and will sync
 *      when you're back online."   (+ "3 changes waiting")
 *   offline, other apps:
 *     "You're offline · Showing what's saved on this phone."
 *   back online with changes waiting:  "Back online · Syncing 3 changes…"
 *   then, for 3 seconds:               "All changes synced"
 *
 * Apps that queue changes report their queue by dispatching
 *   window.dispatchEvent(new CustomEvent('vp:sync-status', { detail: { pending, syncing } }))
 * (CaseLinx does this from the SupraCore runtime). Everything else relies on
 * the browser's own online/offline signal.
 *
 * It never takes taps (pointer-events: none), so it can't cover a button's
 * function, and it is inline-styled so it ships unchanged into every repo.
 *
 * New build (1 Oct 2026): when the server was slow and the phone's saved copy
 * of this page was shown, sw.js says so once the real page arrives
 * ({type:'vp-fresh-page'}). A page nobody has touched yet simply reloads onto
 * the new version; if someone is already tapping or typing, the bar offers
 *   "A newer version is ready · Refresh"
 * instead (the one time it takes a tap — only on the pill itself).
 */
import { useEffect, useRef, useState } from 'react';
export function OfflineBar({ translate }) {
  const t = translate || ((s) => s);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState({
    known: false,
    pending: 0,
    syncing: false,
  });
  const [synced, setSynced] = useState(false);
  const wasOffline = useRef(false);
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => {
      wasOffline.current = true;
      setOnline(false);
    };
    const onSync = (e) => {
      const d = e.detail || {};
      setQueue({ known: true, pending: Math.max(0, d.pending || 0), syncing: !!d.syncing });
    };
    if (!navigator.onLine) wasOffline.current = true;
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    window.addEventListener('vp:sync-status', onSync);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.removeEventListener('vp:sync-status', onSync);
    };
  }, []);
  // A newer version of this page arrived after the saved copy was shown (the
  // server was slow, usually right after a new build — see sw.js).
  useEffect(() => {
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
    if (!sw) return;
    let touched = false;
    let handled = false;
    const touch = () => {
      touched = true;
    };
    const kinds = ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'];
    kinds.forEach((k) => window.addEventListener(k, touch, { capture: true, passive: true }));
    const here = () => window.location.href.split('#')[0];
    const onMessage = (e) => {
      const d = (e.data || {});
      if (handled || d.type !== 'vp-fresh-page' || d.url !== here()) return;
      handled = true;
      // Never reload the same page twice in a minute (a server that is slow
      // every time would otherwise bounce it): offer the button instead.
      const key = 'vp-fresh-reload:' + here();
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(key) || 0);
      } catch {
        // storage blocked (private mode): fine
      }
      if (touched || Date.now() - last < 60 * 1000) {
        setNewer(true);
        return;
      }
      try {
        sessionStorage.setItem(key, String(Date.now()));
      } catch {
        // storage blocked (private mode): fine
      }
      window.location.reload();
    };
    sw.addEventListener('message', onMessage);
    sw.startMessages();
    // The news may have arrived before this page was listening: ask.
    sw.controller?.postMessage({ type: 'vp-fresh?', url: here() });
    return () => {
      kinds.forEach((k) => window.removeEventListener(k, touch, { capture: true }));
      sw.removeEventListener('message', onMessage);
    };
  }, []);

  // Once back online and nothing is waiting, say so briefly, then hide.
  useEffect(() => {
    if (online && wasOffline.current && queue.pending === 0 && !queue.syncing) {
      wasOffline.current = false;
      setSynced(true);
      const id = setTimeout(() => setSynced(false), 3000);
      return () => clearTimeout(id);
    }
  }, [online, queue.pending, queue.syncing]);
  const n = queue.pending;
  const changes = n === 1 ? t('1 change') : `${n} ${t('changes')}`;
  let dot = '#f59e0b';
  let head = '';
  let body = '';
  if (!online) {
    head = t("You're offline");
    if (queue.known) {
      body =
        n > 0
          ? `${changes} ${t('saved on this phone — will sync when you’re back online.')}`
          : t('Your changes are saved on this phone and will sync when you’re back online.');
    } else {
      body = t('Showing what’s saved on this phone. It updates when you’re back online.');
    }
  } else if (n > 0) {
    dot = '#38bdf8';
    head = t('Back online');
    body = `${t('Syncing')} ${changes}…`;
  } else if (synced) {
    dot = '#22c55e';
    head = t('Back online');
    body = queue.known ? t('All changes synced.') : t('Everything is up to date.');
  } else if (newer) {
    return (
      <div role="status" aria-live="polite" style={wrap}>
        <div style={{ ...pill, pointerEvents: 'auto' }}>
          <span aria-hidden style={{ ...dotStyle, background: '#38bdf8' }} />
          <b style={{ fontWeight: 700, minWidth: 0 }}>{t('A newer version is ready')}</b>
          <button type="button" onClick={() => window.location.reload()} style={refreshBtn}>
            {t('Refresh')}
          </button>
        </div>
      </div>
    );
  } else {
    return null;
  }
  return (
    <div role="status" aria-live="polite" style={wrap}>
      <div style={pill}>
        <span aria-hidden style={{ ...dotStyle, background: dot }} />
        <span style={{ minWidth: 0 }}>
          <b style={{ fontWeight: 700 }}>{head}</b>
          <span style={{ opacity: 0.8 }}> · {body}</span>
        </span>
      </div>
    </div>
  );
}
const wrap = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
  zIndex: 450,
  display: 'flex',
  justifyContent: 'center',
  padding: '0 8px',
  pointerEvents: 'none',
};
const pill = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: 'min(560px, 100%)',
  padding: '7px 14px',
  borderRadius: 999,
  background: 'rgba(15,23,42,0.94)',
  backdropFilter: 'saturate(160%) blur(12px)',
  WebkitBackdropFilter: 'saturate(160%) blur(12px)',
  border: '1px solid rgba(148,163,184,0.25)',
  boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
  // vp-dark-audit-ignore: self-contained dark pill with its own light ink in both themes
  color: '#f1f5f9',
  font: '500 12.5px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif',
};
const refreshBtn = {
  flex: '0 0 auto',
  border: 0,
  borderRadius: 999,
  padding: '4px 12px',
  background: '#38bdf8',
  // vp-dark-audit-ignore: lives on the self-contained dark pill in both themes
  color: '#0f172a',
  font: '700 12.5px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif',
  cursor: 'pointer',
};

const dotStyle = {
  flex: '0 0 auto',
  width: 8,
  height: 8,
  borderRadius: 999,
};
export default OfflineBar;
