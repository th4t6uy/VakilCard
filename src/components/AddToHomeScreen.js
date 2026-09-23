'use client';

/**
 * "Add to Home Screen", for the two platforms that handle it nothing alike.
 *
 * ANDROID / desktop Chrome gives us a real hook: the browser decides the app
 * is installable, fires `beforeinstallprompt`, and hands over an event we can
 * fire later from our own button. Calling preventDefault() suppresses Chrome's
 * own mini-infobar so this bar is the only thing the person sees.
 *
 * iOS gives us nothing. Safari has no install prompt and no API — the only
 * route is Share → Add to Home Screen, done by hand. So on iOS this is an
 * instruction, not a button, and it is the ONLY way an iPhone user ever finds
 * out the app can be installed at all.
 *
 * Three things it must never do, each of which is why the checks below look
 * fussier than they are:
 *   - show inside an already-installed window (display-mode: standalone, or
 *     navigator.standalone on iOS);
 *   - show on a non-Safari iOS browser, where Add to Home Screen does not
 *     exist and the instruction would be a lie;
 *   - come back the day after someone dismissed it. Dismissal is remembered
 *     for 60 days, and installing clears it for good.
 *
 * 2026-09-20 — redesigned to fix a real collision: this used to render as a
 * persistent, full-width bar pinned to the bottom of the viewport at
 * zIndex 2147483000 (one below the highest 32-bit int a browser accepts).
 * That sat on top of anything else anchored to the bottom of the screen —
 * confirmed covering SignLinx's "Continue to sign" button on phones, and by
 * construction it would cover any future bottom action bar in any app too.
 * It now IDLES as a small round button in the corner, clear of centred
 * content. It only expands into the full card when the person taps it, and
 * even then it's a capped-width corner card, never a full-width strip.
 *
 * Everything is inline-styled on purpose: this same file ships into eight
 * repos on three different CSS toolchains, and a banner that silently loses
 * its styling in one of them is worse than no banner.
 */

import { useEffect, useState } from 'react';

const KEY = 'vp-a2hs-dismissed';
const SNOOZE_DAYS = 60;
// Shared stacking convention for floating chrome (install prompt, toasts,
// future non-modal banners): stay in the 300–500 band, comfortably above
// normal content but nowhere near a MAX_INT arms race with anything else
// on the page. A true modal (the consent overlay, a confirm dialog) should
// still outrank this.
const Z_FLOAT = 400;

function snoozed() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    if (raw === 'installed') return true;
    return Date.now() - Number(raw) < SNOOZE_DAYS * 864e5;
  } catch {
    return false; // private mode: show it rather than swallow the feature
  }
}

function remember(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* nothing to do — the banner just reappears next visit */
  }
}

function installed() {
  if (typeof window === 'undefined') return true;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS predates the media query and reports it here instead
    window.navigator.standalone === true;
  return Boolean(standalone);
}

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; touch points give it away
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  // Chrome/Firefox/Edge on iOS cannot add to the home screen at all.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function AddToHomeScreen({ appName = 'this app' }) {
  const [evt, setEvt] = useState(null);
  const [ios, setIos] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // The service worker is what makes the browser consider the app
    // installable in the first place, so registration lives here with the
    // thing that depends on it rather than somewhere it can be deleted by
    // accident.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    if (installed() || snoozed()) return;

    const onPrompt = (e) => {
      e.preventDefault();
      setEvt(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => {
      remember('installed');
      setEvt(null);
      setIos(false);
      setOpen(false);
    });

    if (isIosSafari()) setIos(true);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!evt && !ios) return null;

  const snooze = () => {
    remember(String(Date.now()));
    setEvt(null);
    setIos(false);
    setOpen(false);
  };

  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    remember(outcome === 'accepted' ? 'installed' : String(Date.now()));
    setEvt(null);
    setOpen(false);
  };

  // Idle state: a small round button, clear of any centred bottom action bar
  // (a sticky "Sign", "Pay" or "Submit" button an app may have on the same
  // screen). This is the state the banner spends nearly all its time in.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Add ${appName} to your home screen`}
        style={pillBtn}
      >
        <img src="/icons/icon-192.png" alt="" width={26} height={26} style={pillIcon} />
      </button>
    );
  }

  // Open state: a capped-width card anchored to the same corner, never a
  // full-width strip — so even while open it can only ever cover the
  // right-hand edge of a bottom action bar, not the button on it.
  return (
    <div role="dialog" aria-label={`Add ${appName} to your home screen`} style={wrap}>
      <div style={bar}>
        <img src="/icons/icon-192.png" alt="" width={34} height={34} style={icon} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={title}>Add {appName} to your home screen</div>
          <div style={sub}>
            {ios ? (
              <>
                Tap <ShareGlyph /> Share, then <b>Add to Home Screen</b>.
              </>
            ) : (
              'Opens full screen, straight from your phone, like an app.'
            )}
          </div>
        </div>
        {!ios && (
          <button type="button" onClick={install} style={cta}>
            Install
          </button>
        )}
        <button type="button" onClick={snooze} aria-label="Not now" style={close}>
          ✕
        </button>
      </div>
    </div>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden
      style={{ verticalAlign: '-2px', margin: '0 2px' }}>
      <path d="M12 3l4 4h-3v9h-2V7H8l4-4z" fill="currentColor" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7h-2v7H7v-7H5z" fill="currentColor" />
    </svg>
  );
}

const pillBtn = {
  position: 'fixed',
  right: 'max(14px, env(safe-area-inset-right))',
  bottom: 'max(14px, env(safe-area-inset-bottom))',
  zIndex: Z_FLOAT,
  width: 48,
  height: 48,
  padding: 0,
  borderRadius: '50%',
  border: '1px solid var(--vc-hairline)',
  background: 'var(--vc-pill-bg)',
  backdropFilter: 'saturate(180%) blur(14px)',
  WebkitBackdropFilter: 'saturate(180%) blur(14px)',
  boxShadow: '0 6px 20px rgba(16,24,40,0.20)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const pillIcon = { borderRadius: 7, display: 'block' };

const wrap = {
  position: 'fixed',
  right: 'max(12px, env(safe-area-inset-right))',
  bottom: 'max(12px, env(safe-area-inset-bottom))',
  zIndex: Z_FLOAT,
  maxWidth: 'min(340px, calc(100vw - 24px))',
  pointerEvents: 'none',
};

const bar = {
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 10px 10px 12px',
  borderRadius: 16,
  background: 'var(--vc-bar-bg)',
  backdropFilter: 'saturate(180%) blur(14px)',
  WebkitBackdropFilter: 'saturate(180%) blur(14px)',
  border: '1px solid var(--vc-hairline)',
  boxShadow: '0 10px 34px rgba(16,24,40,0.18)',
  color: 'var(--vc-a2hs-ink)',
  font: '500 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif',
};

const icon = { borderRadius: 9, flex: '0 0 auto' };
const title = {
  fontWeight: 650,
  fontSize: 13.5,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const sub = { opacity: 0.72, fontSize: 12, marginTop: 1 };
const cta = {
  flex: '0 0 auto',
  border: 0,
  borderRadius: 10,
  padding: '8px 14px',
  background: 'var(--vc-a2hs-btn-bg)',
  color: 'var(--vc-a2hs-btn-fg)',
  font: '600 13px system-ui, sans-serif',
  cursor: 'pointer',
};
const close = {
  flex: '0 0 auto',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  opacity: 0.5,
  fontSize: 15,
  lineHeight: 1,
  padding: 6,
  cursor: 'pointer',
};

export default AddToHomeScreen;
