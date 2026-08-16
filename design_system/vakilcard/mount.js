/* VakilCard mount + wiring layer (NOT part of the design export).
   The exported VakilCardApp is presentation-only by design; this file does
   the "framework wiring + real data" the handoff README prescribes:
     - boots the component with the server-provided profile (or the design
       system's own demo/default profiles)
     - live cards: delegates taps on action tiles to real intents
       (tel / wa.me / upi / maps / mailto / vcf) + analytics beacons
     - demo & preview: blocks navigation, keeps every visual interaction,
       runs the idle auto-showcase scroll inside .vp-scroll
   It never alters the component's markup, styles, or behaviour. */
(function () {
  var boot = window.__VAKILCARD_BOOT__ || {};
  var visualOnly = !!(boot.demo || boot.preview);
  // True once the owner-detect block (bottom of this file) matches the
  // stored session to THIS card. Drives owner-only education (e.g. the
  // greyed Pro pay preview on a Free card) — never anything visitor-facing.
  var ownerViewing = false;

  if (boot.theme === "light" || boot.theme === "dark") {
    document.documentElement.dataset.theme = boot.theme;
  }

  var profile =
    boot.profile ||
    (boot.demo ? window.vakilDemoProfile : window.vakilDefaultProfile);

  ReactDOM.createRoot(document.getElementById("root")).render(
    React.createElement(window.VakilCardApp, { profile: profile })
  );

  /* 2026-08-16 fix batch: long-pressing any tile/button/logo/QR image was
     triggering the browser's native "save image" / "open link" context
     menu (iOS -webkit-touch-callout + Android's default long-press
     handling) — jarring on a card meant to feel like a native app, and it
     also fought with the app's own double-tap-to-download QR gesture.
     Wiring-layer concern (like the sheets/QR-zoom overlays this file
     already injects), not a component-markup change, so it's scoped to
     #root only rather than touching VakilCardApp.jsx per-element. */
  (function preventLongPressMenu() {
    var style = document.createElement("style");
    style.textContent =
      "#root, #root *{-webkit-touch-callout:none}" +
      "#root img, #root svg{-webkit-user-drag:none;user-drag:none;pointer-events:auto}";
    document.head.appendChild(style);
    var rootEl = document.getElementById("root");
    if (rootEl) {
      rootEl.addEventListener("contextmenu", function (e) { e.preventDefault(); }, false);
      rootEl.addEventListener("dragstart", function (e) { e.preventDefault(); }, false);
    }
  })();

  function track(ev) {
    if (visualOnly || !boot.profileId) return;
    try {
      navigator.sendBeacon(
        "/api/vakilcard/track",
        JSON.stringify({ profile_id: boot.profileId, event_type: ev })
      );
    } catch (e) {}
  }
  // (page views are tracked server-side by the SSR endpoint)

  var links = boot.links || {};
  document.addEventListener(
    "click",
    function (e) {
      // Map-tile ("Open in Maps") is a styled div — match by its caption.
      var mapTile = e.target.closest("div");
      var isMap =
        mapTile &&
        /open in maps/i.test(mapTile.textContent || "") &&
        (mapTile.textContent || "").length < 40;

      var el = e.target.closest("a,button,[role=button]");
      if (!el && !isMap) return;

      if (visualOnly) {
        // No navigation of any kind; React's visual handlers still run.
        if (el && el.tagName === "A") e.preventDefault();
        return;
      }

      if (isMap && links.maps) {
        track("directions");
        window.open(links.maps, "_blank", "noopener");
        return;
      }
      if (!el) return;

      // Social-handle anchors (data-ev="social_*") are REAL links with their
      // own hrefs — track and let the browser navigate natively. Without this
      // early exit the WhatsApp social icon's aria-label would collide with
      // the WhatsApp action-tile branch below and double-open.
      var socialEl = el.closest && el.closest('[data-ev^="social_"]');
      if (socialEl) {
        track(socialEl.getAttribute("data-ev"));
        return;
      }

      var label = (el.getAttribute("aria-label") || el.textContent || "")
        .trim()
        .toLowerCase();

      if (label.indexOf("share") === 0) {
        track("share");
        if (navigator.share) {
          navigator.share({ title: document.title, url: boot.url }).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(boot.url);
        }
        return;
      }
      var go = null, ev = null, newTab = false;
      if (label.indexOf("call") === 0) { go = links.tel; ev = "call"; }
      else if (label.indexOf("whatsapp") === 0) { go = links.whatsapp; ev = "whatsapp"; newTab = true; }
      // "Book Appointment" (Payment section fallback wording) and the
      // CONNECT tile — now labelled just "Appointment" — both route here.
      else if (label.indexOf("book") === 0 || label.indexOf("appointment") === 0) { track("appointment"); showBookSheet(); return; }
      // Only the merged pill's "Pay Now" button reaches this branch now —
      // the CONNECT grid's duplicate "Pay UPI" tile was removed in favour
      // of the Vakilpedia upgrade tile below, so it no longer needs its own
      // label match.
      else if (label.indexOf("pay now") === 0) {
        // Pro: native upi:// intents (links.upi is only ever set for Pro —
        // decided server-side). Free (2026-08-16 fix batch): online
        // payments through the card are Pro-only now — the button is
        // styled locked (see VakilCardApp.jsx) but stays a plain,
        // non-native-disabled element specifically so this click still
        // reaches here; tapping opens the upsell instead of the old
        // showFreePaySheet() QR+UPI-ID flow.
        if (links.upi) { track("pay"); showPaySheet(); }
        else { track("pay_locked"); showPayLockedSheet(); }
        return;
      }
      else if (label.indexOf("directions") === 0) { go = links.maps; ev = "directions"; newTab = true; }
      else if (label.indexOf("email") === 0) { go = links.mailto; ev = "email"; }
      else if (label.indexOf("website") === 0) { go = links.website; ev = "website"; newTab = true; }
      // Google Business tile: opens the owner's Google Business profile
      // EXTERNALLY (Google app / new tab) — Pro-only, decided server-side
      // (links.googleBusiness is only ever set when entitled).
      else if (label.indexOf("google business") === 0) { go = links.googleBusiness; ev = "google_business"; newTab = true; }
      // Reviews tile: Pro deep-links straight to the owner's Google review
      // form (links.review, Pro-only per entitlements). Free reuses the
      // office's Google Maps listing to let visitors read existing reviews
      // (links.reviewView) — never a dead tap either way, and never showing
      // a "leave a review" action Free hasn't unlocked.
      // 2026-08-16 fix batch: was `label.indexOf("review") === 0`, which
      // only matches a caption that STARTS with "review" — but the real
      // server-rendered captions are "Leave a Review" / "View Reviews"
      // (profile.js buildLinks()), so neither actual case ever matched and
      // the tile was a dead tap for every entitled user. indexOf(...) !== -1
      // matches the word anywhere in the caption instead.
      else if (label.indexOf("review") !== -1) {
        if (links.review) { go = links.review; ev = "google_review"; newTab = true; }
        else if (links.reviewView) { go = links.reviewView; newTab = true; }
      }
      // Vakilpedia CONNECT tile — replaces the old duplicate Pay tile,
      // always sends to the VakilCard marketing/upgrade page (no dedicated
      // pricing page exists yet in this repo — flagged in the report).
      else if (label.indexOf("vakilpedia") === 0) { go = "/vakilcard"; newTab = true; }
      // Premium-upsell banner's "Upgrade" button — previously dead (no
      // handler at all). Same destination as the Vakilpedia tile: no
      // dedicated pricing page exists yet, so this lands on the VakilCard
      // marketing/dashboard entry point rather than a broken tap.
      else if (label.indexOf("upgrade") === 0) { go = "https://vakilcard.vakilpedia.com/"; newTab = true; }
      else if (label.indexOf("save") === 0 && links.vcf) { go = links.vcf; ev = "save_contact"; }
      if (go) {
        if (ev) track(ev);
        if (newTab) window.open(go, "_blank", "noopener");
        else window.location.href = go;
      }
    },
    false // bubble phase — after the component's own visual handlers
  );

  /* ---------- glass bottom sheet (shared by Pay + Book) ---------- */

  function openSheet(title, bodyHtml) {
    var old = document.getElementById("vc-sheet");
    if (old) old.remove();
    var wrap = document.createElement("div");
    wrap.id = "vc-sheet";
    wrap.style.cssText = "position:fixed;inset:0;z-index:200;display:flex;align-items:flex-end;justify-content:center;background:rgba(5,5,10,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)";
    var panel = document.createElement("div");
    panel.style.cssText =
      "width:100%;max-width:412px;margin:0 8px 10px;padding:22px 20px 18px;border-radius:24px;" +
      "background:var(--glass-frost);backdrop-filter:blur(28px) saturate(1.4);-webkit-backdrop-filter:blur(28px) saturate(1.4);" +
      "border:1px solid var(--hairline-strong);box-shadow:0 -8px 40px rgba(0,0,0,.5);color:var(--text-hi);" +
      "font-family:var(--font-sans);transform:translateY(28px);opacity:0;transition:all .3s var(--ease-glass, ease-out)";
    panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div style="font-size:15px;font-weight:800">' + title + "</div>" +
      '<button id="vc-sheet-x" aria-label="Close" style="width:30px;height:30px;border-radius:50%;border:1px solid var(--hairline);background:var(--glass-thick);color:var(--text-low);font-size:14px;line-height:1">✕</button>' +
      "</div>" + bodyHtml;
    wrap.appendChild(panel);
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { panel.style.transform = "translateY(0)"; panel.style.opacity = "1"; });
    var close = function () { wrap.remove(); };
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    panel.querySelector("#vc-sheet-x").addEventListener("click", close);
    return { panel: panel, close: close };
  }

  var sheetBtnCss =
    "display:flex;align-items:center;gap:12px;width:100%;padding:13px 14px;margin-top:8px;border-radius:16px;" +
    "border:1px solid var(--hairline);background:var(--glass-thick);color:var(--text-hi);font-family:var(--font-sans);" +
    "font-size:13.5px;font-weight:700;text-decoration:none;cursor:pointer";

  /* ---------- iOS-folder style app tile (icon + label under it) ----------
     Real brand PNGs from /ds/assets/upi/<key>.png (the founder's Logos set,
     trimmed + optimized at build time). MUST be under /ds/* — the www proxy
     forwards only /ds/* and /api/vakilcard/*, so the old /icons/... path
     404'd on www cards (and the files were never shipped at all).
     Founder direction 2026-08-15: FULL-SIZE transparent app icons — the PNG
     fills the whole tile, no padding, no plate, exactly like a home-screen
     icon. The glass ₹ monogram is only a fallback and is HIDDEN the moment
     the real PNG loads. */
  function appTile(key, label, color, href, fg) {
    return (
      '<a href="' + href.replace(/"/g, "&quot;") + '" data-upi-key="' + key + '" aria-label="Pay with ' + label + '" ' +
      'style="display:flex;flex-direction:column;align-items:center;gap:7px;text-decoration:none;padding:6px 2px;border-radius:14px" ' +
      'onfocus="this.style.outline=\'2px solid var(--violet-400)\'" onblur="this.style.outline=\'none\'">' +
      '<span style="position:relative;width:56px;height:56px;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center">' +
      '<span style="position:absolute;inset:0;border-radius:14px;display:flex;align-items:center;justify-content:center;background:var(--glass-thick);border:1px solid var(--hairline);font-size:22px;font-weight:900;color:var(--text-hi);font-family:var(--font-sans)">₹</span>' +
      '<img src="/ds/assets/upi/' + key + '.png" alt="" ' +
      'style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:none" ' +
      'onload="this.style.display=\'block\';this.previousElementSibling.style.display=\'none\'" onerror="this.remove()">' +
      "</span>" +
      '<span style="font-size:10.5px;font-weight:700;color:var(--text-mid);text-align:center;line-height:1.15;max-width:64px">' + label + "</span>" +
      "</a>"
    );
  }

  /* ---------- Shared UPI app launcher set ----------
     One brand list drives the Pro pay sheet, the free Pay Now sheet AND the
     booking payment step, so iconography and ordering never drift apart.
     GPay / PhonePe / Paytm / BHIM / CRED / WhatsApp, each launched by its own
     scheme so a bare upi:// can't be hijacked by the device's default
     handler — no separate fallback row (2026-08-16 fix batch: removed, see
     upiLauncherHtml below).
     Scheme confidence (2026-08-16 fix batch): tez:// / phonepe:// /
     paytmmp:// were already live and working. bhim:// is NPCI's own
     reference-app scheme, high confidence. credpay:// is community-sourced,
     not NPCI-verified — flagged here in case it needs a follow-up fix once
     tested on a real device with CRED installed. WhatsApp Pay has no public,
     distinct URI scheme for external deep-linking (its UPI payments run
     inside WhatsApp's own chat UI, not via an external intent) — this tile
     uses the same generic upi:// intent as every other UPI-registered app,
     so it opens WhatsApp directly when WhatsApp is the device's UPI handler
     for the tapped VPA, or the OS chooser otherwise. That is the same actual
     payment link (q) as every other tile — never a dead tap, and never a
     WhatsApp *chat* link (this is not links.whatsapp). */
  function upiLauncherApps(q) {
    return [
      ["gpay", "Google Pay", "#fff", "tez://upi/pay?" + q],
      ["phonepe", "PhonePe", "#fff", "phonepe://pay?" + q],
      ["paytm", "Paytm", "#fff", "paytmmp://pay?" + q],
      ["bhim", "BHIM UPI", "#fff", "bhim://upi/pay?" + q],
      ["cred", "CRED", "#fff", "credpay://upi/pay?" + q],
      ["whatsapp", "WhatsApp Pay", "#fff", "upi://pay?" + q],
    ];
  }

  /** Noun action icon (black line art) — flipped white in dark theme, same
      rule as the component's IconImg. */
  function nounIcon(name, size) {
    var dark = document.documentElement.dataset.theme !== "light";
    return (
      '<img src="/ds/assets/actions/' + name + '.png" alt="" loading="lazy" ' +
      'style="width:' + (size || 18) + "px;height:" + (size || 18) + "px;object-fit:contain;flex-shrink:0" +
      (dark ? ";filter:invert(1) brightness(1.6)" : "") + '" onerror="this.remove()">'
    );
  }

  /** The launcher block: 3-across brand grid (wraps to 2 rows for 6 apps).
      2026-08-16 fix batch: the generic "Other UPI app" fallback row was
      removed — every app now on the grid (GPay/PhonePe/Paytm/BHIM/CRED/
      WhatsApp) has its own named tile and its own scheme/intent, so the
      ambiguous bare upi:// fallback (which could silently hand off to
      whatever app the phone treats as its UPI default) no longer adds any
      coverage the named tiles don't already provide. `upiUri` is accepted
      for call-site compatibility but is no longer rendered directly here. */
  function upiLauncherHtml(q, upiUri) {
    return (
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px 4px;justify-items:center;padding:6px 0 2px">' +
      upiLauncherApps(q).map(function (a) { return appTile(a[0], a[1], a[2], a[3], a[4]); }).join("") +
      "</div>"
    );
  }

  /** Patches an already-rendered launcher grid's tap-target hrefs in place
   *  (new `am=` amount, same app set) instead of tearing the grid down and
   *  rebuilding it. 2026-08-16: the Pay Now sheet's Custom-amount flow used
   *  to call `bodyEl.innerHTML = upiLauncherHtml(...)` on every keystroke —
   *  destroying and recreating the actual `<a href="tez://…">` /
   *  `<a href="upi://…">` payment-intent links the payer taps, live, while
   *  they may be mid-gesture reaching for one. That's the leading suspect
   *  for reports of GPay appearing to "reopen" the card page unpredictably
   *  right after typing a custom amount — the tile under the payer's finger
   *  could be swapped out for a fresh DOM node between their touchstart and
   *  the click actually resolving. Updating `href` on the SAME elements
   *  removes that failure mode entirely, in addition to being cheaper.
   *  Returns false (caller should fall back to a full rebuild) if the grid
   *  isn't there yet or the app set doesn't match what's currently rendered. */
  function patchUpiLauncherHrefs(container, q) {
    var apps = upiLauncherApps(q);
    var tiles = container.querySelectorAll("a[data-upi-key]");
    if (!tiles.length || tiles.length !== apps.length) return false;
    var byKey = {};
    apps.forEach(function (a) { byKey[a[0]] = a[3]; });
    var ok = true;
    tiles.forEach(function (t) {
      var href = byKey[t.getAttribute("data-upi-key")];
      if (href == null) { ok = false; return; }
      t.setAttribute("href", href);
    });
    return ok;
  }

  /* ---------- iOS-style QR zoom: blur backdrop, fluid center expansion,
     quick download, tap-outside / ESC / ✕ dismiss. No new page. ---------- */
  function showQrZoom(src, downloadName, caption) {
    var old = document.getElementById("vc-qrzoom");
    if (old) old.remove();
    var wrap = document.createElement("div");
    wrap.id = "vc-qrzoom";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Expanded QR code");
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:220;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;" +
      "background:rgba(5,5,10,.45);backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);opacity:0;" +
      "transition:opacity .28s ease-out,backdrop-filter .28s ease-out,-webkit-backdrop-filter .28s ease-out";
    var card = document.createElement("div");
    card.style.cssText =
      "display:flex;flex-direction:column;align-items:center;gap:12px;transform:scale(.55) translateY(14px);opacity:0;" +
      "transition:transform .34s cubic-bezier(.2,.9,.25,1.05),opacity .26s ease-out";
    var size = Math.min(Math.min(window.innerWidth, window.innerHeight) * 0.78, 340);
    card.innerHTML =
      '<img src="' + src.replace(/"/g, "&quot;") + '" alt="QR code, enlarged for scanning" ' +
      'style="width:' + size + "px;height:" + size + 'px;object-fit:contain;border-radius:22px;background:#fff;padding:14px;box-shadow:0 24px 70px rgba(0,0,0,.55)">' +
      (caption ? '<div style="font-size:12.5px;font-weight:700;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.5)">' + caption + "</div>" : "") +
      '<div style="display:flex;gap:10px">' +
      '<a id="vc-qrzoom-dl" href="' + src.replace(/"/g, "&quot;") + '" download="' + (downloadName || "qr") + '" ' +
      'style="display:inline-flex;align-items:center;gap:7px;padding:11px 20px;border-radius:999px;background:#fff;color:#0f172a;font-family:var(--font-sans);font-size:13px;font-weight:800;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.35)">Download</a>' +
      '<button id="vc-qrzoom-x" aria-label="Close expanded QR" ' +
      'style="display:inline-flex;align-items:center;padding:11px 20px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;font-family:var(--font-sans);font-size:13px;font-weight:800;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)">Close</button>' +
      "</div>";
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    requestAnimationFrame(function () {
      wrap.style.opacity = "1";
      wrap.style.backdropFilter = "blur(14px)";
      wrap.style.webkitBackdropFilter = "blur(14px)";
      card.style.transform = "scale(1) translateY(0)";
      card.style.opacity = "1";
    });
    var close = function () {
      wrap.style.opacity = "0";
      wrap.style.backdropFilter = "blur(0px)";
      wrap.style.webkitBackdropFilter = "blur(0px)";
      card.style.transform = "scale(.6) translateY(10px)";
      card.style.opacity = "0";
      document.removeEventListener("keydown", onKey);
      setTimeout(function () { wrap.remove(); }, 300);
    };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    card.querySelector("#vc-qrzoom-x").addEventListener("click", close);
    card.querySelector("#vc-qrzoom-dl").addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("keydown", onKey);
    return close;
  }

  /* ---------- Pay: Pro sheet — consultation fee default + custom amount ----
     Founder spec (2026-08-15): the DEFAULT action is "Pay consultation fee"
     (the owner's configured fee travels in the upi link's am= param); a
     "Custom amount" option lets the payer type any amount, and every deep
     link / the QR regenerates live for the chosen amount. Mobile gets the
     brand app grid + Any-UPI row; desktop gets a real scannable QR. */

  var segBtnCss =
    "flex:1;padding:11px 10px;border-radius:14px;border:1px solid var(--hairline);background:var(--glass-thick);" +
    "color:var(--text-hi);font-family:var(--font-sans);font-size:12px;font-weight:800;cursor:pointer;text-align:center;line-height:1.3";
  var segBtnOnCss = ";border-color:var(--violet-400);box-shadow:0 0 0 1px var(--violet-400) inset";

  function showPaySheet() {
    var upiUri = links.upi; // upi://pay?pa=…&pn=…[&am=fee]
    var baseQ = upiUri.split("?")[1] || "";
    var vpa = "";
    var linkFee = null;
    var baseParams = [];
    baseQ.split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      var k = i < 0 ? kv : kv.slice(0, i);
      var v = i < 0 ? "" : kv.slice(i + 1);
      if (k === "pa") vpa = decodeURIComponent(v || "");
      if (k === "am") { linkFee = parseFloat(decodeURIComponent(v || "")) || null; return; }
      if (k === "tn") return; // note is re-applied per selection
      baseParams.push(kv);
    });
    var fee = typeof boot.fee === "number" && boot.fee > 0 ? boot.fee : linkFee;
    var isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);

    // mode: "fee" (default whenever a fee exists) | "custom"
    var mode = fee ? "fee" : "custom";
    var uriFor = function () {
      var q = baseParams.join("&");
      if (mode === "fee" && fee) {
        q += (q ? "&" : "") + "am=" + encodeURIComponent(String(fee)) + "&tn=" + encodeURIComponent("Consultation fee");
      } else if (mode === "custom") {
        var el = document.getElementById("vc-amt-input");
        var amt = el ? parseFloat(el.value) : NaN;
        if (amt && amt > 0) q += (q ? "&" : "") + "am=" + encodeURIComponent(String(amt));
      }
      return { q: q, uri: "upi://pay?" + q };
    };

    var chooser =
      '<div style="display:flex;gap:8px;margin-bottom:8px">' +
      (fee
        ? '<button id="vc-amt-fee" style="' + segBtnCss + segBtnOnCss + '">Pay consultation fee<span style="display:block;font-size:15px;margin-top:2px">₹' + fee + "</span></button>"
        : "") +
      '<button id="vc-amt-custom" style="' + segBtnCss + (fee ? "" : segBtnOnCss) + '">Custom amount<span style="display:block;font-size:10px;font-weight:600;color:var(--text-low);margin-top:2px">you choose</span></button>' +
      "</div>" +
      '<input id="vc-amt-input" type="number" min="1" inputmode="numeric" placeholder="Enter amount (₹)" ' +
      // font-size MUST be >=16px: iOS Safari auto-zooms the whole page on
      // focus of any text input styled smaller than that, and never zooms
      // back out on blur — feels broken on a card meant to feel native.
      'style="display:' + (fee ? "none" : "block") + ';width:100%;box-sizing:border-box;padding:11px 13px;margin-bottom:8px;border-radius:12px;border:1px solid var(--hairline);background:var(--glass-thick);color:var(--text-hi);font-family:var(--font-sans);font-size:16px">';

    // 2026-08-16 fix batch (correction): the QR belongs in THIS sheet, not
    // embedded in the Pay Now button on the main card (an earlier pass got
    // that wrong — reverted in VakilCardApp.jsx). It renders in the top
    // half of the sheet, above the amount chooser, on every device (not
    // just desktop) — same data-qr-zoom double-tap-to-download gesture
    // used everywhere else in the app, with the caption directly under it.
    var s = openSheet(
      isMobile ? "Pay with UPI" : "Scan to pay with any UPI app",
      '<div id="vc-pay-qr-wrap" style="margin-bottom:10px"></div>' +
        chooser +
        '<div id="vc-pay-body"></div>' +
        '<div style="margin-top:10px;font-size:11.5px;color:var(--text-low);text-align:center">Paying <b style="color:var(--text-hi)">' + vpa + "</b> directly — no middleman.</div>"
    );

    var renderQr = function (cur) {
      var wrap = s.panel.querySelector("#vc-pay-qr-wrap");
      if (!wrap) return;
      wrap.innerHTML =
        '<div id="vc-payqr" data-qr-zoom data-qr-name="upi-payment-qr" data-qr-caption="Scan with any UPI app" role="button" tabindex="0" aria-label="Payment QR — tap to enlarge, double-tap to download" style="display:flex;justify-content:center;padding:6px 0;cursor:zoom-in"><div style="font-size:12px;color:var(--text-low)">Generating QR…</div></div>' +
        '<div style="text-align:center;font-size:10.5px;color:var(--text-dim)">Double-tap the QR to download it</div>';
      var draw = function () {
        var slot = s.panel.querySelector("#vc-payqr");
        if (!slot) return;
        try {
          var qr = window.qrcode(0, "M");
          qr.addData(cur.uri);
          qr.make();
          var dataUrl = qr.createDataURL(8, 8);
          slot.innerHTML = '<img src="' + dataUrl + '" alt="UPI payment QR" style="width:190px;height:190px;border-radius:14px;background:#fff;padding:8px">';
        } catch (e) {
          slot.innerHTML = '<div style="font-size:12px;color:var(--text-low)">Couldn\'t draw the QR — use the options below.</div>';
        }
      };
      if (window.qrcode) draw();
      else {
        var sc = document.createElement("script");
        sc.src = "/ds/qrcode.js";
        sc.onload = draw;
        sc.onerror = draw;
        document.head.appendChild(sc);
      }
    };

    var renderBody = function () {
      var cur = uriFor();
      renderQr(cur);
      var bodyEl = s.panel.querySelector("#vc-pay-body");
      if (isMobile) {
        // Patch the existing tap targets' hrefs in place when possible —
        // only fall back to a full rebuild the first time (grid not there
        // yet) or if the app set itself changed. See
        // patchUpiLauncherHrefs()'s comment for why this matters: rebuilding
        // real payment-intent links live, under the payer's finger, is the
        // leading suspect for "GPay reopens the page" reports.
        if (!patchUpiLauncherHrefs(bodyEl, cur.q)) bodyEl.innerHTML = upiLauncherHtml(cur.q, cur.uri);
        return;
      }
      // Desktop: Copy UPI ID underneath the shared QR above — no separate
      // "Download QR" link needed now that double-click on the QR itself
      // downloads it (the qrTapTimer listener handles mouse double-clicks
      // the same way it handles touch double-taps).
      bodyEl.innerHTML =
        '<div style="text-align:center;font-size:12.5px;color:var(--text-low);margin-top:2px">UPI ID: <b style="color:var(--text-hi)">' + vpa + "</b></div>" +
        '<button id="vc-pay-copy" style="' + sheetBtnCss + ';justify-content:center">Copy UPI ID</button>';
      var copyBtn = s.panel.querySelector("#vc-pay-copy");
      copyBtn.addEventListener("click", function () {
        if (navigator.clipboard) navigator.clipboard.writeText(vpa);
        this.textContent = "Copied ✓";
      });
    };

    var feeBtn = s.panel.querySelector("#vc-amt-fee");
    var customBtn = s.panel.querySelector("#vc-amt-custom");
    var amtInput = s.panel.querySelector("#vc-amt-input");
    var setMode = function (m) {
      mode = m;
      if (feeBtn) feeBtn.style.cssText = segBtnCss + (m === "fee" ? segBtnOnCss : "");
      customBtn.style.cssText = segBtnCss + (m === "custom" ? segBtnOnCss : "");
      amtInput.style.display = m === "custom" ? "block" : "none";
      if (m === "custom") amtInput.focus();
      renderBody();
    };
    if (feeBtn) feeBtn.addEventListener("click", function () { setMode("fee"); });
    customBtn.addEventListener("click", function () { setMode("custom"); });
    // Regenerate every deep link / the QR as the payer types the amount —
    // debounced (2026-08-16) so a fast typist doesn't fire a DOM
    // update-and-possible-rebuild on every single digit; combined with
    // patchUpiLauncherHrefs() above, this means the grid is now touched at
    // most a few hundred ms after the payer stops typing, never mid-keystroke.
    var renderBodyTimer;
    amtInput.addEventListener("input", function () {
      clearTimeout(renderBodyTimer);
      renderBodyTimer = setTimeout(renderBody, 300);
    });
    renderBody();
  }

  /* ---------- Pay Now, locked (Free) ----------
     2026-08-16 fix batch, founder direction: online payments through the
     card are Pro-only now — Free's Pay Now opens this instead of a working
     pay flow. Copy adapts to who's actually looking: the owner (previewing
     their own Free card) gets the upgrade pitch; an actual visitor/client
     — who can't upgrade someone else's plan — gets a neutral explanation
     instead, never a pitch aimed at the wrong person. */
  function showPayLockedSheet() {
    var isOwner = ownerViewing;
    var body =
      '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:6px 0 4px">' +
      '<div style="width:44px;height:44px;border-radius:14px;background:var(--glass-thick);border:1px solid var(--hairline);display:flex;align-items:center;justify-content:center;color:var(--violet-400)">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' +
      "</div>" +
      (isOwner
        ? '<div style="font-size:13.5px;font-weight:800;color:var(--text-hi)">Online payments are a Pro feature</div>' +
          '<div style="font-size:12px;color:var(--text-low);line-height:1.5;max-width:280px">Upgrade to let clients pay you by UPI directly from your card — native app buttons, a scannable QR, and one-tap consultation-fee collection.</div>' +
          '<a href="' + ((boot.dash || "https://vakilcard.vakilpedia.com") + "/").replace(/"/g, "&quot;") + '" target="_blank" rel="noopener" style="' + sheetBtnCss + ';justify-content:center;margin-top:6px">Upgrade to Pro →</a>'
        : '<div style="font-size:13.5px;font-weight:800;color:var(--text-hi)">Online payment isn\'t set up here</div>' +
          '<div style="font-size:12px;color:var(--text-low);line-height:1.5;max-width:280px">This card doesn\'t take payments through VakilCard yet — please contact ' +
          esc((profile && profile.name) || "the owner") +
          " directly to arrange payment.</div>" +
          (links.whatsapp || links.tel
            ? '<div style="display:flex;gap:8px;width:100%;margin-top:6px">' +
              (links.whatsapp ? '<a href="' + links.whatsapp + '" target="_blank" rel="noopener" style="' + sheetBtnCss + ';justify-content:center;margin-top:0;flex:1">' + nounIcon("whatsapp") + "WhatsApp</a>" : "") +
              (links.tel ? '<a href="' + links.tel + '" style="' + sheetBtnCss + ';justify-content:center;margin-top:0;flex:1">' + nounIcon("call") + "Call</a>" : "") +
              "</div>"
            : "")) +
      "</div>";
    openSheet("Pay Now", body);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- FREE pay: the lawyer's own uploaded QR + UPI ID ----------
     ORPHANED as of the 2026-08-16 change above — Free's Pay Now now opens
     showPayLockedSheet() instead of this. Left intact (not deleted) in case
     "Free payments fully gated behind Pro" turns out not to be the
     intended read of that instruction — reverting is then a one-line
     change back to calling this, instead of rebuilding a tested sheet from
     scratch. Delete this block once the gating decision is confirmed. ---- */

  function showFreePaySheet() {
    // Free Pay Now sheet (founder direction 2026-08-15): the UPI app
    // launcher AND the QR image together. The QR (the lawyer's own uploaded
    // one, else drawn from the UPI ID) lets clients scan/screenshot manually
    // — tap enlarges it, DOUBLE-TAP downloads it. Pro cards never show a QR
    // in their Pay sheet on mobile — native intents replace it. On mobile we
    // launch each app by its OWN custom scheme (tez:// / phonepe:// /
    // paytmmp://) — a bare upi:// can be hijacked by WhatsApp Pay when it's
    // the device's default upi handler — with the "Any UPI app" row (upi://)
    // as the graceful system-chooser fallback.
    var upiId = boot.upiId || "";
    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    var q =
      "pa=" + encodeURIComponent(upiId) +
      "&pn=" + encodeURIComponent((profile && profile.name) || "") +
      "&cu=INR";
    var upiUri = "upi://pay?" + q;
    var body = "";
    if (isMobile && upiId) {
      body += upiLauncherHtml(q, upiUri);
    }
    if (boot.payQr || upiId) {
      body +=
        '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:' + (isMobile && upiId ? "12px" : "4px") + '">' +
        '<div id="vc-freeqr" data-qr-zoom data-qr-name="' + (upiId || "upi").replace(/"/g, "") + '-qr" data-qr-caption="Scan with any UPI app" role="button" tabindex="0" aria-label="Payment QR — tap to enlarge, double-tap to download" ' +
        'style="width:150px;height:150px;border-radius:14px;background:#fff;padding:8px;display:flex;align-items:center;justify-content:center;cursor:zoom-in;box-shadow:0 4px 14px rgba(0,0,0,.25)">' +
        '<div style="font-size:11px;color:#555">Loading QR…</div></div>' +
        '<div style="font-size:10.5px;color:var(--text-dim)">Tap to enlarge · Double-tap to download</div>' +
        "</div>";
    }
    if (upiId) {
      body +=
        '<div style="text-align:center;font-size:12.5px;color:var(--text-low);margin-top:12px">' +
        (isMobile ? "Paying " : "Scan to pay ") +
        '<b style="color:var(--text-hi)">' + upiId + "</b>" +
        (isMobile ? " directly — no middleman." : " with any UPI app.") +
        "</div>" +
        '<button id="vc-freepay-copy" style="' + sheetBtnCss + ';justify-content:center;margin-top:10px">Copy UPI ID</button>';
    } else if (!boot.payQr) {
      body += '<div style="text-align:center;font-size:12.5px;color:var(--text-low);padding:10px 0">Scan the QR on the card with any UPI app.</div>';
    }
    // Educate the (detected) owner of a Free card: show exactly what the Pro
    // pay sheet adds — greyed out, non-interactive — so they see what they're
    // missing (founder direction 2026-08-15). NEVER shown to visitors: a
    // client paying a lawyer must never see the lawyer's plan pitched.
    if (ownerViewing && !boot.pro) {
      body +=
        '<div style="margin-top:14px;padding:12px;border-radius:16px;border:1px dashed var(--hairline-strong);position:relative">' +
        '<span style="position:absolute;top:-8px;left:12px;padding:2px 8px;border-radius:999px;background:var(--violet-400);color:#fff;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;font-family:var(--font-sans)">Pro preview</span>' +
        '<div style="opacity:.45;filter:grayscale(1);pointer-events:none">' +
        '<div style="display:flex;gap:8px;margin-bottom:8px">' +
        '<span style="' + segBtnCss + segBtnOnCss + ';display:block">Pay consultation fee<span style="display:block;font-size:15px;margin-top:2px">₹ your fee</span></span>' +
        '<span style="' + segBtnCss + ';display:block">Custom amount<span style="display:block;font-size:10px;font-weight:600;color:var(--text-low);margin-top:2px">client chooses</span></span>' +
        "</div>" +
        "</div>" +
        '<div style="font-size:11px;color:var(--text-low);line-height:1.45;margin-top:8px">Only you can see this. On <b style="color:var(--text-hi)">VakilCard Pro</b>, clients pay your set consultation fee — or any amount — in one tap, straight into your UPI.</div>' +
        '<a href="' + ((boot.dash || "https://vakilcard.vakilpedia.com") + "/").replace(/"/g, "&quot;") + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:800;color:var(--violet-400);text-decoration:none;font-family:var(--font-sans)">Upgrade to Pro →</a>' +
        "</div>";
    }
    var s = openSheet(isMobile ? "Pay with UPI" : "Pay via UPI", body);
    var copyBtn = s.panel.querySelector("#vc-freepay-copy");
    if (copyBtn)
      copyBtn.addEventListener("click", function () {
        if (navigator.clipboard) navigator.clipboard.writeText(upiId);
        this.textContent = "Copied ✓";
      });
    // Fill the QR slot: the lawyer's own uploaded QR exactly as uploaded,
    // else a real QR drawn locally from the UPI ID — never a placeholder.
    var qrSlot = s.panel.querySelector("#vc-freeqr");
    if (qrSlot) {
      var setImg = function (src) {
        qrSlot.innerHTML =
          '<img src="' + src.replace(/"/g, "&quot;") + '" alt="UPI payment QR" style="width:100%;height:100%;object-fit:contain;border-radius:8px">';
      };
      if (boot.payQr) setImg(boot.payQr);
      else if (upiId) {
        var drawFreeQr = function () {
          try {
            var qr = window.qrcode(0, "M");
            qr.addData(upiUri);
            qr.make();
            setImg(qr.createDataURL(6, 6));
          } catch (err) {
            qrSlot.innerHTML = '<div style="font-size:10px;color:#555">Use the UPI ID below</div>';
          }
        };
        if (window.qrcode) drawFreeQr();
        else {
          var sc2 = document.createElement("script");
          sc2.src = "/ds/qrcode.js";
          sc2.onload = drawFreeQr;
          sc2.onerror = drawFreeQr;
          document.head.appendChild(sc2);
        }
      }
    }
  }

  /* ---------- Book Appointment ----------
     Free: pick one of the owner's fixed weekly windows, submit name+phone —
     no calendar check, no payment (documented Free behaviour; overlapping
     placeholder requests are expected, not a bug).
     Pro: same slot list but Google-Calendar-aware (server excludes busy
     ranges), then a Consultation-fee-vs-Custom-amount choice, a native UPI
     app chooser for payment, and an honest two-step "I've paid" self-report
     — there is no gateway webhook for upi:// deep links, so the owner
     confirms receipt manually from their dashboard afterward.
     Any fetch failure, or a profile with no windows configured, falls back
     to WhatsApp/Call — a booking sheet must never be a dead end. */

  function showBookSheet() {
    var fallbackBody =
      '<div style="font-size:13px;color:var(--text-low);line-height:1.5">Online booking isn\'t set up yet. Message directly — it\'s the fastest way to get a slot.</div>' +
      (links.whatsapp ? '<a href="' + links.whatsapp + '" target="_blank" rel="noopener" style="' + sheetBtnCss + ';justify-content:center">' + nounIcon("whatsapp") + "Message on WhatsApp</a>" : "") +
      (links.tel ? '<a href="' + links.tel + '" style="' + sheetBtnCss + ';justify-content:center">' + nounIcon("call") + "Call instead</a>" : "");
    var showFallback = function () { openSheet("Book an appointment", fallbackBody); };

    var username = (boot.profile && boot.profile.username) || "";
    if (!username || !boot.profileId) { showFallback(); return; }

    // 2026-08-16 fix batch: root cause of "appointment button slow / feels
    // stuck" was that this fetch had NO timeout — the server's own Google
    // Calendar calls (freeBusy / token refresh) also had none, so a slow
    // (not erroring) Google response left this request hanging silently
    // with no loading state and no fallback ever firing. Fixed on both
    // ends: an immediate loading sheet here so the tap always gets instant
    // feedback, plus an AbortController so a hung request degrades to the
    // WhatsApp/Call fallback within 8s instead of stalling indefinitely.
    var loading = openSheet("Book an appointment", '<div style="display:flex;align-items:center;justify-content:center;padding:28px 0;color:var(--text-low);font-size:13px">Loading available times…</div>');
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      if (controller) controller.abort();
    }, 8000);

    fetch(
      "/api/vakilcard/booking?action=public_slots&username=" + encodeURIComponent(username),
      controller ? { signal: controller.signal } : undefined
    )
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        clearTimeout(timer);
        loading.close();
        if (!data || !Array.isArray(data.slots) || !data.slots.length) { showFallback(); return; }
        renderSlotPicker(data);
      })
      .catch(function () {
        clearTimeout(timer);
        loading.close();
        showFallback();
      });
  }

  function renderSlotPicker(data) {
    var slots = data.slots;
    var fmt = function (iso) {
      var d = new Date(iso);
      return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) +
        " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    };
    var body =
      '<div style="font-size:12px;color:var(--text-low);margin-bottom:8px">Pick a time — you\'ll confirm your details next.</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto">' +
      slots.map(function (s, i) {
        return '<button data-slot-i="' + i + '" style="' + sheetBtnCss + ';justify-content:space-between">' + fmt(s.start) + '<span style="opacity:.5">›</span></button>';
      }).join("") +
      "</div>";
    var s = openSheet("Book an appointment", body);
    s.panel.querySelectorAll("[data-slot-i]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        renderRequestForm(data, slots[+btn.getAttribute("data-slot-i")]);
      });
    });
  }

  function renderRequestForm(data, slot) {
    var fmt = function (iso) {
      var d = new Date(iso);
      return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) +
        " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    };
    var pro = !!data.pro;
    var payReq = pro && data.payment && data.payment.required;
    var body =
      '<div style="font-size:12.5px;font-weight:700;color:var(--text-hi);margin-bottom:10px">' + fmt(slot.start) + "</div>" +
      // font-size 16px on every real text input in this sheet — below that,
      // iOS Safari force-zooms the page on focus and never un-zooms.
      '<input id="vc-bk-name" placeholder="Your name" style="width:100%;box-sizing:border-box;padding:11px 13px;margin-bottom:8px;border-radius:12px;border:1px solid var(--hairline);background:var(--glass-thick);color:var(--text-hi);font-family:var(--font-sans);font-size:16px">' +
      '<input id="vc-bk-phone" placeholder="Phone number" type="tel" style="width:100%;box-sizing:border-box;padding:11px 13px;margin-bottom:8px;border-radius:12px;border:1px solid var(--hairline);background:var(--glass-thick);color:var(--text-hi);font-family:var(--font-sans);font-size:16px">' +
      '<textarea id="vc-bk-purpose" placeholder="What\'s this about? (optional)" rows="2" style="width:100%;box-sizing:border-box;padding:11px 13px;margin-bottom:8px;border-radius:12px;border:1px solid var(--hairline);background:var(--glass-thick);color:var(--text-hi);font-family:var(--font-sans);font-size:16px;resize:vertical"></textarea>';

    if (payReq) {
      var fee = data.payment.consultation_fee;
      body +=
        '<div style="display:flex;gap:8px;margin:4px 0 8px">' +
        '<label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px;border-radius:12px;border:1px solid var(--hairline);background:var(--glass-thick);font-size:12.5px;color:var(--text-hi)"><input type="radio" name="vc-bk-type" value="consultation" checked>Consultation' + (fee ? " (₹" + fee + ")" : "") + "</label>" +
        '<label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px;border-radius:12px;border:1px solid var(--hairline);background:var(--glass-thick);font-size:12.5px;color:var(--text-hi)"><input type="radio" name="vc-bk-type" value="custom">Other amount</label>' +
        "</div>" +
        '<input id="vc-bk-amount" placeholder="Amount (₹)" type="number" min="1" style="display:none;width:100%;box-sizing:border-box;padding:11px 13px;margin-bottom:8px;border-radius:12px;border:1px solid var(--hairline);background:var(--glass-thick);color:var(--text-hi);font-family:var(--font-sans);font-size:16px">';
    }
    body += '<button id="vc-bk-submit" style="' + sheetBtnCss + ';justify-content:center;margin-top:4px">Request this slot</button>' +
      '<div id="vc-bk-err" style="font-size:11.5px;color:var(--danger,#f66);margin-top:6px;display:none"></div>';

    var s = openSheet("Confirm your details", body);
    var amountInput = s.panel.querySelector("#vc-bk-amount");
    if (payReq) {
      s.panel.querySelectorAll('input[name="vc-bk-type"]').forEach(function (r) {
        r.addEventListener("change", function () { amountInput.style.display = r.value === "custom" && r.checked ? "block" : "none"; });
      });
    }
    s.panel.querySelector("#vc-bk-submit").addEventListener("click", function () {
      var name = s.panel.querySelector("#vc-bk-name").value.trim();
      var phone = s.panel.querySelector("#vc-bk-phone").value.trim();
      var errEl = s.panel.querySelector("#vc-bk-err");
      if (!name || !phone) {
        errEl.textContent = "Name and phone are required.";
        errEl.style.display = "block";
        return;
      }
      var bookingType = payReq ? (s.panel.querySelector('input[name="vc-bk-type"]:checked') || {}).value || "consultation" : "consultation";
      var amount = bookingType === "custom" ? +(amountInput && amountInput.value) : undefined;
      fetch("/api/vakilcard/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request",
          username: (boot.profile && boot.profile.username) || "",
          client_name: name,
          client_phone: phone,
          purpose: s.panel.querySelector("#vc-bk-purpose").value.trim(),
          start: slot.start,
          end: slot.end,
          booking_type: bookingType,
          amount_inr: amount,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          track("appointment");
          if (!d || !d.ok) {
            errEl.textContent = "Couldn't send your request — please try again or message directly.";
            errEl.style.display = "block";
            return;
          }
          if (d.payment_status === "pending" && d.pay_link) renderPaymentStep(d);
          else renderRequestDone("Request sent! You'll be confirmed shortly.");
        })
        .catch(function () {
          errEl.textContent = "Couldn't send your request — please try again or message directly.";
          errEl.style.display = "block";
        });
    });
  }

  function renderPaymentStep(reqResult) {
    var q = reqResult.pay_link.split("?")[1] || "";
    var body =
      '<div style="font-size:12.5px;color:var(--text-low);margin-bottom:8px">Pay <b style="color:var(--text-hi)">₹' + reqResult.amount_inr + '</b> to confirm — your slot is held until then.</div>' +
      upiLauncherHtml(q, reqResult.pay_link) +
      '<button id="vc-bk-paid" style="' + sheetBtnCss + ';justify-content:center;margin-top:10px">I\'ve paid</button>' +
      '<div style="font-size:10.5px;color:var(--text-dim);margin-top:8px;text-align:center;line-height:1.4">Paid directly via UPI — no gateway in between. The lawyer confirms receipt before your appointment is finalised.</div>';
    var s = openSheet("Complete payment", body);
    s.panel.querySelector("#vc-bk-paid").addEventListener("click", function () {
      fetch("/api/vakilcard/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_payment", request_id: reqResult.id }),
      })
        .then(function () { renderRequestDone("Thanks! Your payment is noted — you'll be confirmed once it's verified."); })
        .catch(function () { renderRequestDone("Noted. If confirmation doesn't arrive, message directly."); });
    });
  }

  function renderRequestDone(message) {
    var body = '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 0 4px;text-align:center">' +
      '<div style="width:44px;height:44px;border-radius:50%;background:var(--success);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px">✓</div>' +
      '<div style="font-size:13.5px;color:var(--text-hi);line-height:1.5">' + message + "</div></div>";
    openSheet("All set", body);
  }

  /* Auto showcase (demo only): after 3.5s of initial idleness, glide the
     chamber scroll through Payment → Connect → About → Practice → Office,
     pause, loop. The FIRST user interaction stops it permanently — the
     tour must never fight the user for the scroll position. */
  if (boot.demo) {
    var touched = false;
    ["pointerdown", "wheel", "touchstart", "keydown"].forEach(function (t) {
      document.addEventListener(t, function () { touched = true; }, { passive: true, capture: true });
    });
    var start = Date.now(), pauseUntil = 0, dir = 1;
    function tick() {
      if (touched) return; // hand control back for good
      var sc = document.querySelector(".vp-scroll");
      if (sc && Date.now() - start > 3500 && Date.now() > pauseUntil) {
        var max = sc.scrollHeight - sc.clientHeight;
        var y = sc.scrollTop + dir * 0.7;
        if (y >= max) { dir = -1; pauseUntil = Date.now() + 1600; }
        if (y <= 0) { dir = 1; pauseUntil = Date.now() + 2200; }
        sc.scrollTop = y;
        if (Math.round(y) % 300 === 0) pauseUntil = Date.now() + 1100;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- QR image download (double-tap) ----------
     Uploaded QRs live on another origin, where the anchor `download`
     attribute is ignored — fetch to a blob first; if that's blocked, open
     the image so the client can long-press-save it. Data/blob URLs (the
     locally drawn QRs) download directly. */
  function downloadQrImage(src, name) {
    var save = function (url, revoke) {
      var a = document.createElement("a");
      a.href = url;
      a.download = name || "qr.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    };
    if (/^(data|blob):/.test(src)) { save(src); return; }
    fetch(src, { mode: "cors" })
      .then(function (r) { if (!r.ok) throw new Error("http_" + r.status); return r.blob(); })
      .then(function (b) { save(URL.createObjectURL(b), true); })
      .catch(function () { window.open(src, "_blank", "noopener"); });
  }

  /* ---------- QR tap → iOS-style zoom; DOUBLE-tap → direct download ----------
     (founder direction 2026-08-15: double-clicking the QR image downloads it
     so clients can scan it manually later). A short timer tells the two
     apart: the second tap of a double-tap cancels the pending zoom. Works in
     every mode — purely visual/local, no navigation. */
  var qrTapTimer = null;
  document.addEventListener("click", function (e) {
    var slot = e.target.closest && e.target.closest("[data-qr-zoom]");
    if (!slot) return;
    var img = slot.querySelector("img");
    if (!img || !img.src) return;
    e.preventDefault();
    e.stopPropagation();
    var src = img.src;
    var name = (slot.getAttribute("data-qr-name") || "qr") + ".png";
    var caption = slot.getAttribute("data-qr-caption") || "";
    if (qrTapTimer) {
      clearTimeout(qrTapTimer);
      qrTapTimer = null;
      if (visualOnly) { showQrZoom(src, name, caption); return; } // demo/preview: keep it visual
      downloadQrImage(src, name);
      return;
    }
    qrTapTimer = setTimeout(function () {
      qrTapTimer = null;
      showQrZoom(src, name, caption);
    }, 300);
  }, true); // capture — before the visual-only anchor blocker

  // Keyboard access for the same tiles (role=button in the component).
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var slot = e.target.closest && e.target.closest("[data-qr-zoom]");
    if (!slot) return;
    e.preventDefault();
    var img = slot.querySelector("img");
    if (img && img.src) showQrZoom(img.src, (slot.getAttribute("data-qr-name") || "qr") + ".png", slot.getAttribute("data-qr-caption") || "");
  });

  /* ---------- Mobile browser zoom assist ----------
     When the visitor pinch-zooms far in, float an unobtrusive "Reset Zoom"
     pill bottom-right; it disappears once scale returns near 1. Browsers
     don't allow programmatically resetting pinch zoom directly — the
     supported approach is a transient viewport clamp (maximum-scale=1),
     released right after so accessibility zooming stays available. */
  if (window.visualViewport) {
    var zoomPill = null;
    var ensurePill = function () {
      if (zoomPill) return zoomPill;
      zoomPill = document.createElement("button");
      zoomPill.id = "vc-zoom-reset";
      zoomPill.setAttribute("aria-label", "Reset page zoom");
      zoomPill.textContent = "Reset Zoom";
      zoomPill.style.cssText =
        "position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:240;" +
        "padding:10px 16px;border-radius:999px;border:1px solid var(--hairline-strong, rgba(255,255,255,.25));" +
        "background:var(--glass-frost, rgba(15,15,20,.85));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);" +
        "color:var(--text-hi,#fff);font-family:var(--font-sans,system-ui);font-size:12.5px;font-weight:800;" +
        "box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer;opacity:0;transform:translateY(8px);" +
        "transition:opacity .25s ease-out,transform .25s ease-out;pointer-events:none";
      zoomPill.addEventListener("click", function () {
        var vp = document.querySelector('meta[name="viewport"]');
        if (!vp) return;
        var original = vp.getAttribute("content") || "";
        vp.setAttribute("content", original.replace(/,?\s*maximum-scale=[^,]*/g, "") + ", maximum-scale=1.0");
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(function () { vp.setAttribute("content", original); }, 350);
      });
      document.body.appendChild(zoomPill);
      return zoomPill;
    };
    var onVvChange = function () {
      var zoomedIn = window.visualViewport.scale > 1.35;
      var pill = ensurePill();
      pill.style.opacity = zoomedIn ? "1" : "0";
      pill.style.transform = zoomedIn ? "translateY(0)" : "translateY(8px)";
      pill.style.pointerEvents = zoomedIn ? "auto" : "none";
    };
    window.visualViewport.addEventListener("resize", onVvChange);
    window.visualViewport.addEventListener("scroll", onVvChange);
  }

  /* ---------- AppLinx platform runtime: PWA service worker ----------
     Registration follows the @applinx/next registerServiceWorker() contract
     (same SKIP_WAITING message protocol, same update detection) so installed
     VakilCards get the platform's app-shell offline launch + background
     asset updates. Updates activate silently in the background and apply on
     the next visit — never a forced reload mid-view (AppLinx rule). */
  if (!visualOnly && boot.profileId && "serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.register("/vakilcard-sw.js").then(function (reg) {
        var activateInBackground = function (worker) {
          if (worker) worker.postMessage("SKIP_WAITING");
        };
        if (reg.waiting) activateInBackground(reg.waiting);
        reg.addEventListener("updatefound", function () {
          var installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", function () {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              activateInBackground(reg.waiting);
            }
          });
        });
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- Add-to-Home-Screen (PWA) — live cards on mobile only ----------
     Android/Chrome: capture beforeinstallprompt and offer a one-tap install.
     iOS Safari: no install API — show a short instruction sheet instead.
     Never shown in demo/preview, inside an already-installed app, on
     desktop, or within 14 days of being dismissed. */
  if (!visualOnly && boot.profileId) {
    var isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    var isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    var snoozed = false;
    try {
      snoozed = Date.now() - (+localStorage.getItem("vc_a2hs_dismissed") || 0) < 14 * 864e5;
    } catch (e) {}

    if (isMobile && !isStandalone && !snoozed) {
      var deferredPrompt = null;
      var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

      function dismiss(banner) {
        banner.remove();
        try { localStorage.setItem("vc_a2hs_dismissed", String(Date.now())); } catch (e) {}
      }

      function showBanner() {
        if (document.getElementById("vc-a2hs")) return;
        var b = document.createElement("div");
        b.id = "vc-a2hs";
        b.setAttribute("role", "dialog");
        b.setAttribute("aria-label", "Add to Home Screen");
        b.style.cssText =
          "position:fixed;left:12px;right:12px;bottom:14px;z-index:99;display:flex;align-items:center;gap:12px;" +
          "padding:14px 16px;border-radius:18px;background:var(--glass-frost);backdrop-filter:blur(24px) saturate(1.4);" +
          "-webkit-backdrop-filter:blur(24px) saturate(1.4);border:1px solid var(--hairline-strong);" +
          "box-shadow:0 10px 30px rgba(0,0,0,.45);color:var(--text-hi);font-family:var(--font-sans);" +
          "transform:translateY(120%);transition:transform .45s var(--ease-glass)";
        b.innerHTML =
          '<img src="/vakilcard-pwa-192.png" alt="" style="width:38px;height:38px;border-radius:10px;flex-shrink:0">' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:700">Keep this card on your phone</div>' +
          '<div style="font-size:11.5px;color:var(--text-low);line-height:1.35">' +
          (isIos
            ? "Tap <b>Share</b> then <b>Add to Home Screen</b> — it opens like an app."
            : "Install it — opens instantly, like an app.") +
          "</div></div>" +
          (isIos
            ? ""
            : '<button id="vc-a2hs-go" style="flex-shrink:0;height:36px;padding:0 16px;border-radius:999px;border:0;background:var(--violet-400);color:#fff;font-size:12.5px;font-weight:700;font-family:var(--font-sans)">Add</button>') +
          '<button id="vc-a2hs-x" aria-label="Dismiss" style="flex-shrink:0;width:30px;height:30px;border-radius:50%;border:1px solid var(--hairline);background:var(--glass-thick);color:var(--text-low);font-size:14px;line-height:1">✕</button>';
        document.body.appendChild(b);
        requestAnimationFrame(function () { b.style.transform = "translateY(0)"; });
        b.querySelector("#vc-a2hs-x").addEventListener("click", function () { dismiss(b); });
        var go = b.querySelector("#vc-a2hs-go");
        if (go)
          go.addEventListener("click", function () {
            if (deferredPrompt) {
              deferredPrompt.prompt();
              deferredPrompt.userChoice.finally(function () { b.remove(); });
              deferredPrompt = null;
            } else dismiss(b);
          });
      }

      if (isIos) {
        setTimeout(showBanner, 2600);
      } else {
        window.addEventListener("beforeinstallprompt", function (e) {
          e.preventDefault();
          deferredPrompt = e;
          setTimeout(showBanner, 2600);
        });
      }
    }
  }

  /* ---------- Real card-image save (double-tap) — live cards only ----------
     Captures ONLY the glass visiting-card element as a PNG: rounded corners
     stay transparent, the pearl glass fill is preserved. Renderer
     (/ds/html-to-image.js) loads lazily on first use. */
  if (!visualOnly) {
    document.addEventListener("dblclick", function (e) {
      var card = e.target.closest('[title*="Double-tap"]');
      if (!card) return;
      var run = function () {
        // Faithful export of the on-screen card:
        //  1) html-to-image can't render backdrop-filter, so the live glass
        //     would export flat — bake a self-contained pearl-glass paint for
        //     the capture only.
        //  2) Freeze the card's exact on-screen width (+box-sizing) so the
        //     cloned node can't reflow — reflow made every line wrap a word
        //     early and the gold divider overlap the name.
        //  3) Wait for web fonts (document.fonts.ready) so the clone measures
        //     text in the real Google fonts, not a wider fallback.
        // Every touched inline style is restored so the on-screen card is
        // unchanged.
        var rect = card.getBoundingClientRect();
        var touched = ["background", "backdropFilter", "webkitBackdropFilter", "boxShadow", "transform", "transition", "boxSizing", "width"];
        var saved = {};
        touched.forEach(function (p) { saved[p] = card.style[p]; });
        // The name is single-line shrink-to-fit in the component; give the
        // export one extra notch of headroom so a wider fallback font in the
        // capture clone can never clip or collide with the gold divider.
        var nameEl = card.querySelector("[data-card-name]");
        var savedNameFs = nameEl ? nameEl.style.fontSize : null;
        if (nameEl) {
          var fs = parseFloat(getComputedStyle(nameEl).fontSize) || 22;
          nameEl.style.fontSize = Math.max(12, fs - 1) + "px";
        }
        // The gold avatar ring's own box-shadow renders oversized/misplaced
        // through html-to-image's SVG capture path (a known renderer quirk
        // with shadows on circular clipped elements) even though it looks
        // fine live — drop it for the capture only, restore after.
        var ringEl = card.querySelector("[data-card-avatar-ring]");
        var savedRingShadow = ringEl ? ringEl.style.boxShadow : null;
        if (ringEl) ringEl.style.boxShadow = "none";
        // The photo, if any, is hosted off-origin (Supabase Storage). It
        // displays fine live via crossOrigin="anonymous", but html-to-image
        // fetches images through its own path when inlining them into the
        // capture and can silently drop one that fetch can't read (opaque/
        // CORS-blocked response) — the export comes out with the DP missing
        // even though nothing else looks wrong. Swap in a same-origin data:
        // URL for the capture only; any failure here just leaves the photo
        // as before, never worse than the pre-fix behaviour.
        //
        // 2026-08-16: the previous approach here (fetch(url,{mode:'cors'})
        // + FileReader) still left the DP missing for at least one real
        // user despite the Storage bucket sending a correct
        // access-control-allow-origin:* header (verified directly) — most
        // likely a Safari-specific quirk where fetch() and an <img
        // crossorigin> load of the SAME URL don't share a cache/CORS
        // decision cleanly. Switched to the more standard, more broadly
        // reliable technique for this exact problem: load a FRESH Image()
        // with crossOrigin set, draw it to an offscreen <canvas>, and read
        // it back with canvas.toDataURL() — a different browser code path
        // than fetch, and the one most cross-origin-export tools rely on.
        // The old fetch+blob approach is kept as a second fallback in case
        // toDataURL throws (e.g. a genuinely tainted canvas).
        var photoEl = card.querySelector("[data-card-photo]");
        var savedPhotoSrc = photoEl ? photoEl.src : null;
        var photoToDataUrl = function (url) {
          return new Promise(function (resolve, reject) {
            var img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = function () {
              try {
                var canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth || 200;
                canvas.height = img.naturalHeight || 200;
                canvas.getContext("2d").drawImage(img, 0, 0);
                resolve(canvas.toDataURL("image/png"));
              } catch (e) { reject(e); }
            };
            img.onerror = function () { reject(new Error("photo image load failed")); };
            img.src = url;
          });
        };
        var photoFetchFallback = function (url) {
          return fetch(url, { mode: "cors", cache: "force-cache" })
            .then(function (r) { if (!r.ok) throw new Error("photo fetch " + r.status); return r.blob(); })
            .then(function (blob) {
              return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(reader.result); };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            });
        };
        var photoSwap = Promise.resolve();
        if (photoEl && savedPhotoSrc) {
          photoSwap = photoToDataUrl(savedPhotoSrc)
            .catch(function () { return photoFetchFallback(savedPhotoSrc); })
            .then(function (dataUrl) { photoEl.src = dataUrl; })
            .catch(function () { /* both methods failed — keep the original src, no worse than before */ });
        }
        var restore = function () {
          touched.forEach(function (p) { card.style[p] = saved[p]; });
          if (nameEl) nameEl.style.fontSize = savedNameFs;
          if (ringEl) ringEl.style.boxShadow = savedRingShadow;
          if (photoEl && savedPhotoSrc) photoEl.src = savedPhotoSrc;
        };
        // Premium frosted-glass export: a diagonal top-left sheen + pearl tint
        // over a lightly-frosted base. Kept opaque enough (≈0.9) that dark text
        // stays crisp, but far less "flat white" than before — reads as glass.
        card.style.background =
          "linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.06) 34%, rgba(255,255,255,0) 56%), " +
          "linear-gradient(125deg, rgba(251,231,212,0.5), rgba(230,221,246,0.5) 48%, rgba(219,233,247,0.55)), " +
          "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(244,246,252,0.9))";
        card.style.backdropFilter = "none";
        card.style.webkitBackdropFilter = "none";
        card.style.boxShadow =
          "0 14px 34px rgba(20,22,40,0.20), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.5)";
        card.style.transform = "none";
        card.style.transition = "none";
        card.style.boxSizing = "border-box";
        card.style.width = Math.round(rect.width) + "px";
        var fileName =
          ((boot.profile && boot.profile.name) || "vakilcard")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-vakilcard.png";
        var download = function (url) {
          var a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
        };
        var shoot = function () {
          // High-res PNG (pixelRatio 3). On phones we hand the file to the Web
          // Share sheet, whose "Save Image" writes to Photos (iOS) / Gallery
          // (Android) — the only web path that reaches the photo library rather
          // than the Downloads folder. Desktop / unsupported → normal download.
          window.htmlToImage
            .toBlob(card, { pixelRatio: 3, cacheBust: true })
            .then(function (blob) {
              restore();
              if (!blob) return;
              var file = null;
              try { file = new File([blob], fileName, { type: "image/png" }); } catch (e) {}
              if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: "VakilCard" }).catch(function () {
                  download(URL.createObjectURL(blob));
                });
              } else {
                download(URL.createObjectURL(blob));
              }
            })
            .catch(function (err) {
              restore();
              console.warn("[VakilCard] save image failed:", err && err.message);
            });
        };
        var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
        // Wait for BOTH web fonts and the swapped-in photo blob to actually
        // decode before shooting — setting .src is async, and capturing one
        // frame too early is exactly how a DP goes missing from the export.
        var photoDecoded = photoSwap.then(function () {
          if (!photoEl || typeof photoEl.decode !== "function") return;
          return photoEl.decode().catch(function () {});
        });
        Promise.all([fontsReady, photoDecoded]).then(
          function () { requestAnimationFrame(shoot); },
          shoot
        );
      };
      if (window.htmlToImage) run();
      else {
        var sc = document.createElement("script");
        sc.src = "/ds/html-to-image.js";
        sc.onload = run;
        document.head.appendChild(sc);
      }
    });
  }

  /* ---------- Owner auto-detect → minimal Edit chip ----------
     The dashboard and public cards share an origin, so the owner's session
     tokens are readable here. If the stored access token's pid matches this
     card (refreshing once if expired), show a light glass "Edit" chip that
     only the owner ever sees. */
  if (!visualOnly && boot.profileId) {
    var decodeJwt = function (t) {
      try {
        return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      } catch (e) { return null; }
    };
    var showEditChip = function () {
      ownerViewing = true;
      if (document.getElementById("vc-edit-chip")) return;
      var a = document.createElement("a");
      a.id = "vc-edit-chip";
      // The dashboard lives on its own subdomain since the 2026-08-04
      // cutover — the old relative "/vakilcard/setup" resolves nowhere on
      // either origin (www or the card subdomain) and was a dead tap.
      a.href = (boot.dash || "https://vakilcard.vakilpedia.com") + "/setup";
      a.textContent = "✎ Edit my card";
      a.style.cssText =
        "position:fixed;bottom:14px;right:14px;z-index:98;display:inline-flex;align-items:center;gap:6px;" +
        "height:38px;padding:0 16px;border-radius:999px;background:var(--glass-frost);" +
        "backdrop-filter:blur(20px) saturate(1.4);-webkit-backdrop-filter:blur(20px) saturate(1.4);" +
        "border:1px solid var(--hairline-strong);color:var(--text-hi);font-family:var(--font-sans);" +
        "font-size:12.5px;font-weight:700;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.3)";
      document.body.appendChild(a);
    };
    var storedAccess = null, storedRefresh = null;
    try {
      storedAccess = localStorage.getItem("vc_access_token");
      storedRefresh = localStorage.getItem("vc_refresh_token");
    } catch (e) {}
    var claims = storedAccess && decodeJwt(storedAccess);
    if (claims && claims.pid === boot.profileId && claims.exp * 1000 > Date.now() + 30000) {
      showEditChip();
    } else if (storedRefresh) {
      fetch("/api/vakilcard/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", refresh_token: storedRefresh }),
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.access_token) return;
          try {
            localStorage.setItem("vc_access_token", d.access_token);
            if (d.refresh_token) localStorage.setItem("vc_refresh_token", d.refresh_token);
          } catch (e) {}
          var c2 = decodeJwt(d.access_token);
          if (c2 && c2.pid === boot.profileId) showEditChip();
        })
        .catch(function () {});
    }
  }
})();
