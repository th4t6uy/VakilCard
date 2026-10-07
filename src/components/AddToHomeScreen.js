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
 *   - come back after it has been shown once (founder, 7 Oct 2026 — this
 *     replaced the 7-day reminder of 30 Sept); installing hides it for good.
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
 * 2026-09-29 — moved to the bottom-LEFT corner (founder: it kept landing on
 * top of each app's own bottom-right button — back-to-top, Support, the
 * VakilCard setup button, toasts). Bottom-right is where apps put their own
 * floating actions; this button is the guest, so it takes the other corner.
 * Matches CaseLinx's copy, which was already bottom-left.
 *
 * 2026-10-07 — founder: "no more repeating PWA popups". Rules now, in every
 * app that carries this file:
 *   - it appears ONCE, after 30 seconds of use (tab on screen and the person
 *     signed in), and never again once it has been shown: closing it,
 *     ignoring it, or installing all count. The old weekly reminder, the
 *     iPhone auto-open, the idle round button and the sign-in nudge are gone.
 *
 * Everything is inline-styled on purpose: this same file ships into eight
 * repos on three different CSS toolchains, and a banner that silently loses
 * its styling in one of them is worse than no banner.
 */

import { useEffect, useRef, useState } from 'react';

// 2026-10-07 founder: ONE popup, once. It shows after 30 seconds of use, and
// closing it (or installing) means it never comes back on this browser.
const KEY = 'vp-a2hs-dismissed'; // set the moment the card is shown; 'installed' once installed
const AUTO_KEY = 'vp-a2hs-auto-opened'; // older builds' "already auto-opened" flag: counts as seen
const USE_KEY = 'vp-a2hs-use-ms'; // milliseconds of use so far, kept across page loads
const DELAY_MS = 30_000;
// Shared stacking convention for floating chrome (install prompt, toasts,
// future non-modal banners): stay in the 300–500 band, comfortably above
// normal content but nowhere near a MAX_INT arms race with anything else
// on the page. A true modal (the consent overlay, a confirm dialog) should
// still outrank this.
const Z_FLOAT = 400;

// Seen before on this browser (shown, dismissed or installed)? Any value
// counts, including the 7-day timestamps older builds stored.
function alreadyShown() {
  try {
    return Boolean(localStorage.getItem(KEY) || localStorage.getItem(AUTO_KEY));
  } catch {
    return false; // private mode: show it rather than swallow the feature
  }
}

function remember(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* nothing to do — worst case the card shows again next visit */
  }
}

function readUseMs() {
  try {
    return Number(localStorage.getItem(USE_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function writeUseMs(ms) {
  try {
    localStorage.setItem(USE_KEY, String(ms));
  } catch {
    /* private mode: the clock restarts on every page load */
  }
}

// Is someone signed in on this browser? Apps that know for sure pass the
// `signedIn` prop. Otherwise look for the saved sign-in the Vakilpedia apps
// all keep (a Supabase session: a cookie or storage key starting "sb-").
function hasSavedSession() {
  try {
    if (/(?:^|;\s*)sb-/.test(document.cookie)) return true;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      if ((window.localStorage.key(i) || '').startsWith('sb-')) return true;
    }
  } catch {
    /* storage blocked: treat as signed out */
  }
  return false;
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
  // Firefox/Edge/Opera on iOS have no Add to Home Screen. Chrome on iOS
  // 16.4+ does (Share → Add to Home Screen), so it gets the walkthrough too.
  return !/FxiOS|EdgiOS|OPiOS/.test(ua);
}

// Chrome fires `beforeinstallprompt` once, early. Catch it at module load so a
// page that mounts the card later (after sign-in, after 30 s) still has it.
let savedEvt = null;
const evtListeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    savedEvt = e;
    evtListeners.forEach((fn) => fn(e));
  });
  window.addEventListener('appinstalled', () => {
    remember('installed');
    savedEvt = null;
  });
}

// An installed app can stay open for days, and the browser only looks for a
// new service worker on a full page load. Look again whenever the app comes
// back on screen (at most every 30 minutes).
let swWatching = false;
let swCheckedAt = 0;
function checkForNewVersionOnReturn(reg) {
  if (swWatching) return;
  swWatching = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - swCheckedAt < 30 * 60 * 1000) return;
    swCheckedAt = Date.now();
    reg.update().catch(() => {});
  });
}

/**
 * Props:
 *   signedIn       true/false when the app knows; leave out to detect a saved sign-in.
 *   requireSignIn  default true — the 30 seconds only count while signed in.
 *   icon           image shown on the card.
 */
export function AddToHomeScreen({
  appName = 'this app',
  signedIn,
  requireSignIn = true,
  icon = '/icons/icon-192.png',
}) {
  const [evt, setEvt] = useState(null);
  const [ios, setIos] = useState(false);
  const [eligible, setEligible] = useState(false); // not installed, never shown before
  const [used, setUsed] = useState(false); // 30 seconds of use reached
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // The service worker is what makes the browser consider the app
    // installable in the first place, so registration lives here with the
    // thing that depends on it rather than somewhere it can be deleted by
    // accident.
    if ('serviceWorker' in navigator) {
      // single-page app: see sw.js
      navigator.serviceWorker
        .register('/sw.js?spa=1', { updateViaCache: 'none' })
        .then(checkForNewVersionOnReturn)
        .catch(() => {});
    }
    if (installed() || alreadyShown()) return;
    setEligible(true);
    if (savedEvt) setEvt(savedEvt);
    const onEvt = (e) => setEvt(e);
    evtListeners.add(onEvt);
    const onInstalled = () => {
      setEvt(null);
      setIos(false);
      setOpen(false);
      setEligible(false);
    };
    window.addEventListener('appinstalled', onInstalled);
    if (isIosSafari()) setIos(true);
    return () => {
      evtListeners.delete(onEvt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // The 30-second clock: counts only while the tab is on screen and, where
  // sign-in is required, only while someone is signed in. Kept across page
  // loads so moving around the app does not restart it.
  useEffect(() => {
    if (!eligible || used) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const ok = requireSignIn ? (signedIn === undefined ? hasSavedSession() : signedIn) : true;
      if (!ok) return;
      const ms = readUseMs() + 1000;
      writeUseMs(ms);
      if (ms >= DELAY_MS) setUsed(true);
    }, 1000);
    return () => clearInterval(id);
  }, [eligible, used, signedIn, requireSignIn]);

  // Show once. The moment it appears it is remembered, so a reload or a
  // later visit never shows it again, whether or not it was dismissed.
  const canShow = eligible && used && Boolean(evt || ios);
  useEffect(() => {
    if (!canShow || open) return;
    remember(String(Date.now()));
    setOpen(true);
  }, [canShow, open]);

  if (!open) return null;

  const dismiss = () => {
    remember('done');
    setEvt(null);
    setIos(false);
    setEligible(false);
    setOpen(false);
  };

  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    remember(outcome === 'accepted' ? 'installed' : 'done');
    setEvt(null);
    setEligible(false);
    setOpen(false);
  };

  // iOS: no install API exists, so the card is a walkthrough that shows each
  // tap (IosInstallCard, below). 2026-09-29.
  if (ios) {
    return <IosInstallCard appName={appName} icon={icon} onClose={dismiss} />;
  }

  // A capped-width card in the bottom-left corner, never a full-width strip —
  // so it can only ever cover the left edge of a bottom action bar, not the
  // button on it.
  return (
    <div role="dialog" aria-label={`Add ${appName} to your home screen`} style={wrap}>
      <div style={bar}>
        <img src={icon} alt="" width={34} height={34} style={iconStyle} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={title}>Add {appName} to your home screen</div>
          <div style={sub}>
            {'Opens full screen, straight from your phone, like an app.'}
          </div>
        </div>
        <button type="button" onClick={install} style={cta}>
            Install
          </button>
        <button type="button" onClick={dismiss} aria-label="Not now" style={close}>
          ✕
        </button>
      </div>
    </div>
  );
}


const wrap = {
  position: 'fixed',
  left: 'max(12px, env(safe-area-inset-left))',
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

const iconStyle = { borderRadius: 9, flex: '0 0 auto' };
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

// ─────────────────────────────────────────────────────────────────────────────
// iOS install walkthrough (2026-09-29)
//
// Apple gives a web page no install button, so on an iPhone the only way in is
// a chain of taps through Safari's own menus — six screens on iOS 26, where
// "Add to Home Screen" moved behind the page menu and "View More".
//
// For Safari 26 the card plays a short looping clip (muted, inline, like a GIF)
// cut from a REAL screen recording of an iPhone doing it — real Safari
// screens, with a blue tap marker on each button — next to numbered steps that
// highlight in time with the clip. Tapping a step jumps the clip there. The
// clip lives at /a2hs/ios-add-to-home.mp4 in each app's public folder
// (~200 KB) and is only downloaded when someone opens this card.
//
// Older Safari and Chrome on iPhone use different menus, and we have no real
// recording of those, so they get the written steps only — never a drawn
// imitation that might not match what the person actually sees.
// ─────────────────────────────────────────────────────────────────────────────
function iosFlow() {
  const ua = navigator.userAgent;
  // Chrome on iOS 16.4+ can add to the home screen via its own Share button.
  if (/CriOS/.test(ua)) return 'chrome';
  // Safari 26 freezes the OS number in the user agent but not its own version.
  const v = /Version\/(\d+)/.exec(ua);
  return v && Number(v[1]) >= 26 ? 'safari26' : 'safari';
}
// `at` = second in the clip where that step's screen starts (clip is 19.9s).
const IOS_STEPS = {
  safari26: [
    { label: 'Tap the ☰ button at the bottom, next to the web address', at: 0 },
    { label: 'Tap Share', at: 3.87 },
    { label: 'Tap View More (the round ⌄ button)', at: 6.8 },
    { label: 'Tap Add to Home Screen', at: 9.73 },
    { label: 'Keep “Open as Web App” ON and tap Add (top right)', at: 12.67 },
    { label: 'Done — open it from your Home Screen', at: 16.27 },
  ],
  safari: [
    { label: 'Tap the Share button (square with an arrow) at the bottom' },
    { label: 'Scroll down and tap Add to Home Screen' },
    { label: 'Tap Add (top right)' },
    { label: 'Done — open it from your Home Screen' },
  ],
  chrome: [
    { label: 'Tap the Share button (square with an arrow) in the address bar' },
    { label: 'Tap Add to Home Screen (tap More if you don’t see it)' },
    { label: 'Tap Add (top right)' },
    { label: 'Done — open it from your Home Screen' },
  ],
};
const IOS_CLIP = '/a2hs/ios-add-to-home.mp4';
const IOS_POSTER = '/a2hs/ios-add-to-home.jpg';
function IosInstallCard({ appName, icon, onClose }) {
  const [flow] = useState(iosFlow);
  const steps = IOS_STEPS[flow];
  const hasClip = flow === 'safari26';
  const [cur, setCur] = useState(0);
  const videoRef = useRef(null);
  // iOS only autoplays a video that is muted and inline, so set both on the
  // element itself before asking it to play (React's `muted` prop alone is
  // not always reflected in time).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.play().catch(() => {
      /* autoplay refused (e.g. Low Power Mode): the poster + steps still show */
    });
  }, []);
  const onTime = () => {
    const v = videoRef.current;
    if (!v) return;
    let n = 0;
    steps.forEach((s, i) => {
      if (s.at !== undefined && v.currentTime >= s.at) n = i;
    });
    if (n !== cur) setCur(n);
  };
  const jump = (i) => {
    const v = videoRef.current;
    const at = steps[i].at;
    if (v && at !== undefined) {
      v.currentTime = at + 0.05;
      v.play().catch(() => {});
    }
    setCur(i);
  };
  return (
    <div role="dialog" aria-label={`Add ${appName} to your Home Screen`} style={iosWrap}>
      <div style={iosCard}>
        <div style={iosHead}>
          <img src={icon} alt="" width={26} height={26} style={iconStyle} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={title}>Add {appName} to Home Screen</div>
            <div style={sub}>Opens like an app. Here’s how:</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Not now" style={close}>
            ✕
          </button>
        </div>
        <div style={iosBody}>
          {hasClip && (
            <video
              ref={videoRef}
              src={IOS_CLIP}
              poster={IOS_POSTER}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onTimeUpdate={onTime}
              aria-label="Short video showing each tap on an iPhone"
              style={iosVideo}
            />
          )}
          <ol style={iosList}>
            {steps.map((s, n) => {
              const active = hasClip && n === cur;
              return (
                <li key={s.label} style={{ margin: 0 }}>
                  <button
                    type="button"
                    onClick={() => jump(n)}
                    aria-current={active ? 'step' : undefined}
                    style={{
                      ...iosStep,
                      cursor: hasClip ? 'pointer' : 'default',
                      opacity: !hasClip || active ? 1 : 0.55,
                      fontWeight: active ? 650 : 500,
                    }}
                  >
                    <span
                      style={{
                        ...iosNum,
                        background: active || !hasClip ? '#0a84ff' : 'rgba(127,127,127,0.18)',
                        color: active || !hasClip ? '#fff' : 'inherit',
                      }}
                    >
                      {n + 1}
                    </span>
                    <span>{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
const iosWrap = {
  position: 'fixed',
  right: 'max(12px, env(safe-area-inset-right))',
  bottom: 'max(12px, env(safe-area-inset-bottom))',
  zIndex: Z_FLOAT,
  width: 'min(380px, calc(100vw - 24px))',
  maxHeight: '48vh',
};
const iosCard = {
  padding: 10,
  maxHeight: '48vh',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  borderRadius: 18,
  background: 'var(--a2hs-bg, rgba(255,255,255,0.97))',
  backdropFilter: 'saturate(180%) blur(14px)',
  WebkitBackdropFilter: 'saturate(180%) blur(14px)',
  border: '1px solid var(--a2hs-border, rgba(20,31,58,0.10))',
  boxShadow: '0 12px 38px rgba(16,24,40,0.22)',
  // vp-dark-audit-ignore: self-contained light card with its own explicit dark ink (theme vars override where an app defines them)
  color: 'var(--a2hs-fg, #141f3a)',
  font: '500 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif',
};
const iosHead = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flex: '0 0 auto' };
const iosBody = { display: 'flex', gap: 10, alignItems: 'center', minHeight: 0 };
// Sized so the whole card stays under half the screen (founder rule, 29 Sept):
// the clip is at most 230px tall and never more than 30% of the viewport.
const iosVideo = {
  flex: '0 0 auto',
  height: 'min(230px, 30vh)',
  aspectRatio: '360 / 732',
  borderRadius: 16,
  background: '#000',
  objectFit: 'cover',
  boxShadow: '0 0 0 3px #111, 0 4px 14px rgba(0,0,0,0.25)',
  margin: 3,
};
const iosList = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
  flex: 1,
  maxHeight: '100%',
  overflowY: 'auto', // the steps scroll inside the card, never the card off-screen
};
const iosStep = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  padding: '3px 0',
  font: 'inherit',
  fontSize: 12.5,
  lineHeight: 1.25,
};
const iosNum = {
  flex: '0 0 auto',
  width: 19,
  height: 19,
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 700,
  marginTop: -1,
};

export default AddToHomeScreen;
