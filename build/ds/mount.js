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

  if (boot.theme === "light" || boot.theme === "dark") {
    document.documentElement.dataset.theme = boot.theme;
  }

  var profile =
    boot.profile ||
    (boot.demo ? window.vakilDemoProfile : window.vakilDefaultProfile);

  ReactDOM.createRoot(document.getElementById("root")).render(
    React.createElement(window.VakilCardApp, { profile: profile })
  );

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
      // Only the big Payment-section "Pay Now" button reaches this branch
      // now — the CONNECT grid's duplicate "Pay UPI" tile was removed in
      // favour of the Vakilpedia upgrade tile below, so it no longer needs
      // its own label match.
      else if (label.indexOf("pay now") === 0) {
        // Pro: native upi:// intents (links.upi is only ever set for Pro —
        // decided server-side). Free: the lawyer's uploaded QR + UPI ID.
        if (links.upi) { track("pay"); showPaySheet(); }
        else if (boot.payQr || boot.upiId) { track("pay"); showFreePaySheet(); }
        return;
      }
      else if (label.indexOf("directions") === 0) { go = links.maps; ev = "directions"; newTab = true; }
      else if (label.indexOf("email") === 0) { go = links.mailto; ev = "email"; }
      else if (label.indexOf("website") === 0) { go = links.website; ev = "website"; newTab = true; }
      // Vakilpedia CONNECT tile — replaces the old duplicate Pay tile,
      // always sends to the VakilCard marketing/upgrade page (no dedicated
      // pricing page exists yet in this repo — flagged in the report).
      else if (label.indexOf("vakilpedia") === 0) { go = "/vakilcard"; newTab = true; }
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
     Brand PNGs load lazily from /icons/upi/<key>.png (background-removed,
     transparent — see Vakilpedia/Logos Icons UX UI, the canonical source);
     until the asset exists the tile shows a brand-coloured monogram — never
     a broken image. object-fit:contain (not cover) because these are real
     logo lockups, not square glyphs — cropping would clip the wordmark. */
  function appTile(key, label, color, href, fg) {
    return (
      '<a href="' + href.replace(/"/g, "&quot;") + '" aria-label="Pay with ' + label + '" ' +
      'style="display:flex;flex-direction:column;align-items:center;gap:7px;text-decoration:none;padding:6px 2px;border-radius:14px" ' +
      'onfocus="this.style.outline=\'2px solid var(--violet-400)\'" onblur="this.style.outline=\'none\'">' +
      '<span style="position:relative;width:56px;height:56px;border-radius:14px;overflow:hidden;background:' + color + ';display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.12)">' +
      '<span style="font-size:22px;font-weight:900;color:' + (fg || "#fff") + ';font-family:var(--font-sans)">₹</span>' +
      '<img src="/icons/upi/' + key + '.png" alt="" ' +
      'style="position:absolute;inset:6px;width:calc(100% - 12px);height:calc(100% - 12px);object-fit:contain;display:none" ' +
      'onload="this.style.display=\'block\'" onerror="this.remove()">' +
      "</span>" +
      '<span style="font-size:10.5px;font-weight:700;color:var(--text-mid);text-align:center;line-height:1.15;max-width:64px">' + label + "</span>" +
      "</a>"
    );
  }

  /* ---------- Shared UPI app launcher set ----------
     One brand list drives BOTH the Pro grid and the free Pay Now sheet so the
     iconography and ordering never drift apart. `q` = the upi query string
     (pa/pn/cu…); `upiUri` = the full upi:// intent used for the graceful
     system-chooser fallback. Every key maps to a real PNG in /icons/upi/. */
  function upiLauncherApps(q, upiUri) {
    return [
      ["gpay", "Google Pay", "#f1f3f4", "tez://upi/pay?" + q, "#1a73e8"],
      ["phonepe", "PhonePe", "#5f259f", "phonepe://pay?" + q],
      ["paytm", "Paytm", "#0f2f66", "paytmmp://pay?" + q],
      ["bhim", "BHIM", "#00639b", upiUri],
      ["amazonpay", "Amazon Pay", "#232f3e", upiUri],
      ["upi", "Any UPI app", "#635BFF", upiUri],
    ];
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

  /* ---------- Pay: UPI app chooser (mobile) / real QR (desktop) ---------- */

  function showPaySheet() {
    var upiUri = links.upi; // upi://pay?pa=…&pn=…
    var q = upiUri.split("?")[1] || "";
    var vpa = "";
    q.split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p[0] === "pa") vpa = decodeURIComponent(p[1] || "");
    });
    var isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);

    if (isMobile) {
      // iOS-folder app grid: icon tile + label underneath, three per row.
      // Dedicated schemes where they exist; the rest ride the standard
      // upi:// intent — the OS routes it to the chosen/default handler.
      // Official-brand app launcher. App-specific schemes resolve straight to
      // that app; brands without a reliable public scheme (BHIM/Amazon Pay)
      // ride the standard upi:// intent so the OS routes to the installed app
      // or shows the system UPI chooser (graceful fallback — never a dead tap).
      // NOTE: every key here has a real brand PNG in /icons/upi/ — no letter
      // monograms. To make extra apps a Pro-only perk later, split this into a
      // base set + a Pro-gated `extras` array (boot.pro decides which render).
      var apps = upiLauncherApps(q, upiUri);
      var body =
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px 4px;justify-items:center;padding:6px 0 2px">' +
        apps.map(function (a) { return appTile(a[0], a[1], a[2], a[3], a[4]); }).join("") +
        "</div>";
      body += '<div style="margin-top:10px;font-size:11.5px;color:var(--text-low);text-align:center">Paying <b style="color:var(--text-hi)">' + vpa + "</b> directly — no middleman.</div>";
      openSheet("Pay with UPI", body);
      return;
    }

    // Desktop: a REAL scannable QR of the exact upi:// URI + copy + download.
    var s = openSheet(
      "Scan to pay with any UPI app",
      '<div id="vc-payqr" data-qr-zoom data-qr-name="upi-payment-qr" data-qr-caption="Scan with any UPI app" role="button" tabindex="0" aria-label="Tap to enlarge the payment QR" style="display:flex;justify-content:center;padding:10px 0;cursor:zoom-in"><div style="font-size:12px;color:var(--text-low)">Generating QR…</div></div>' +
        '<div style="text-align:center;font-size:12.5px;color:var(--text-low);margin-top:2px">UPI ID: <b style="color:var(--text-hi)">' + vpa + "</b></div>" +
        '<button id="vc-pay-copy" style="' + sheetBtnCss + ';justify-content:center">Copy UPI ID</button>' +
        '<a id="vc-pay-dl" style="' + sheetBtnCss + ';justify-content:center;display:none">Download QR</a>'
    );
    var renderQr = function () {
      try {
        var qr = window.qrcode(0, "M");
        qr.addData(upiUri);
        qr.make();
        var dataUrl = qr.createDataURL(8, 8);
        s.panel.querySelector("#vc-payqr").innerHTML =
          '<img src="' + dataUrl + '" alt="UPI payment QR" style="width:210px;height:210px;border-radius:14px;background:#fff;padding:8px">';
        var dl = s.panel.querySelector("#vc-pay-dl");
        dl.href = dataUrl;
        dl.download = (vpa || "upi") + "-qr.gif";
        dl.style.display = "flex";
      } catch (e) {
        s.panel.querySelector("#vc-payqr").innerHTML =
          '<div style="font-size:12px;color:var(--text-low)">Couldn\'t draw the QR — use the UPI ID below.</div>';
      }
    };
    if (window.qrcode) renderQr();
    else {
      var sc = document.createElement("script");
      sc.src = "/ds/qrcode.js";
      sc.onload = renderQr;
      sc.onerror = renderQr;
      document.head.appendChild(sc);
    }
    s.panel.querySelector("#vc-pay-copy").addEventListener("click", function () {
      if (navigator.clipboard) navigator.clipboard.writeText(vpa);
      this.textContent = "Copied ✓";
    });
  }

  /* ---------- FREE pay: the lawyer's own uploaded QR + UPI ID ---------- */

  function showFreePaySheet() {
    // Pay Now = a REAL UPI app launcher, never a second copy of the QR. The
    // card's Payment section already shows the QR tile + its Download/enlarge;
    // re-showing the QR here was the reported "duplicate QR" bug. On mobile we
    // launch each app by its OWN custom scheme (tez:// / phonepe:// /
    // paytmmp://) where one exists — a bare upi:// can be hijacked by WhatsApp
    // Pay when it's the device's default upi handler — and fall back to the
    // system UPI chooser (upi://) for brands without a public scheme.
    var upiId = boot.upiId || "";
    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    var q =
      "pa=" + encodeURIComponent(upiId) +
      "&pn=" + encodeURIComponent((profile && profile.name) || "") +
      "&cu=INR";
    var upiUri = "upi://pay?" + q;
    var body = "";
    if (isMobile && upiId) {
      body +=
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px 8px;justify-items:center;padding:6px 0 2px">' +
        upiLauncherApps(q, upiUri).map(function (a) { return appTile(a[0], a[1], a[2], a[3], a[4]); }).join("") +
        "</div>";
    }
    if (upiId) {
      body +=
        '<div style="text-align:center;font-size:12.5px;color:var(--text-low);margin-top:12px">' +
        (isMobile ? "Paying " : "Scan the QR on the card, or pay ") +
        '<b style="color:var(--text-hi)">' + upiId + "</b>" +
        (isMobile ? " directly — no middleman." : " with any UPI app.") +
        "</div>" +
        '<button id="vc-freepay-copy" style="' + sheetBtnCss + ';justify-content:center;margin-top:10px">Copy UPI ID</button>';
    } else {
      body += '<div style="text-align:center;font-size:12.5px;color:var(--text-low);padding:10px 0">Scan the QR on the card with any UPI app.</div>';
    }
    var s = openSheet(isMobile ? "Pay with UPI" : "Pay via UPI", body);
    var copyBtn = s.panel.querySelector("#vc-freepay-copy");
    if (copyBtn)
      copyBtn.addEventListener("click", function () {
        if (navigator.clipboard) navigator.clipboard.writeText(upiId);
        this.textContent = "Copied ✓";
      });
  }

  /* ---------- Book Appointment ----------
     Pro: booking flow (coming-soon sheet until the scheduling backend
     ships). Free: direct WhatsApp — never a dead button either way. */

  function showBookSheet() {
    if (!boot.pro) {
      if (links.whatsapp) window.open(links.whatsapp, "_blank", "noopener");
      else if (links.tel) window.location.href = links.tel;
      return;
    }
    var actionIcon = function (name) {
      return '<img src="/icons/actions/' + name + '.png" alt="" loading="lazy" style="width:18px;height:18px;object-fit:contain;flex-shrink:0" onerror="this.remove()">';
    };
    var body =
      '<div style="font-size:13px;color:var(--text-low);line-height:1.5">Online appointment booking is <b style="color:var(--text-hi)">coming soon</b>. Until then, message directly — it\'s the fastest way to get a slot.</div>' +
      (links.whatsapp
        ? '<a href="' + links.whatsapp + '" target="_blank" rel="noopener" style="' + sheetBtnCss + ';justify-content:center">' + actionIcon("whatsapp") + "Message on WhatsApp</a>"
        : "") +
      (links.tel ? '<a href="' + links.tel + '" style="' + sheetBtnCss + ';justify-content:center">' + actionIcon("call") + "Call instead</a>" : "");
    openSheet("Book an appointment", body);
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

  /* ---------- QR tap → iOS-style zoom (works in every mode: it's purely
     visual, no navigation — demo visitors get to feel the interaction). */
  document.addEventListener("click", function (e) {
    var slot = e.target.closest && e.target.closest("[data-qr-zoom]");
    if (!slot) return;
    var img = slot.querySelector("img");
    if (!img || !img.src) return;
    e.preventDefault();
    e.stopPropagation();
    showQrZoom(img.src, (slot.getAttribute("data-qr-name") || "qr") + ".png", slot.getAttribute("data-qr-caption") || "");
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
        var restore = function () {
          touched.forEach(function (p) { card.style[p] = saved[p]; });
          if (nameEl) nameEl.style.fontSize = savedNameFs;
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
        fontsReady.then(function () { requestAnimationFrame(shoot); }, shoot);
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
      if (document.getElementById("vc-edit-chip")) return;
      var a = document.createElement("a");
      a.id = "vc-edit-chip";
      a.href = "/vakilcard/setup";
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
