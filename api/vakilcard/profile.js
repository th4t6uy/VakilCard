// VakilCard public profile — served at vakilpedia.com/<username>.
//
// Rendering: the official Design System VakilCard (design_system/vakilcard,
// the verbatim Claude Design export) is THE one card implementation. This
// endpoint emits a thin SSR shell: full per-profile SEO metadata in the head
// (crawlers never execute JS, so OG/JSON-LD must be server-side), then the
// prebuilt DS bundle (/ds/*) mounts the component with this profile's data.
// Public cards, the signup-page interactive demo (?demo=1, DS showcase
// profile: Adv. Sidharth Gautam), and the wizard's draft preview (?pt=token)
// all render through this single path — no other card renderer exists.
const {
  esc,
  jsStr,
  cleanPhone,
  resolveProfileOrAlias,
  trackEvent,
  readJsonBody,
} = require("./_lib");
const { verify: verifyJwt } = require("./_jwt");
const { isProActive, lockedCardFeatures } = require("./_entitlements");

const SITE = "https://www.vakilpedia.com";
// Owner dashboard's own domain (cut over 2026-08-04) — see auth.js.
const DASHBOARD_SITE = process.env.VAKILCARD_DASHBOARD_URL || "https://vakilcard.vakilpedia.com";

// Self-contained "finish setting up" page for a DRAFT (not-yet-published)
// card. Reached from: (a) the WhatsApp welcome link sent the moment a kiosk
// signup creates the account (messaging.sendWelcome — that Meta template's
// ONE variable is this permanent card URL, so it must always resolve to
// SOMETHING useful, published or not), and (b) a re-tap of an already-bound
// but still-draft physical card (nfc.js GET handler).
// Deliberately NOT tied to this specific profile's phone number: the OTP
// form below asks the visitor for THEIR OWN phone and signs them into
// whichever account that phone resolves to (same contract as
// ensureAccountForPhone). That is what makes this page safe to serve at a
// guessable/public URL — a stranger who lands here can only ever end up
// signed into their own account, never this profile's owner's account.
function finishSetupPage(username) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Finish setting up your VakilCard</title>
<meta name="robots" content="noindex">
<style>
  body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(120deg,#CDEFFB,#FDEECB);padding:24px;box-sizing:border-box}
  .card{background:#fff;border-radius:20px;padding:32px 24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.12)}
  h1{font-size:20px;font-weight:900;margin:0 0 6px;color:#0f172a}
  p{color:#475569;font-size:14px;line-height:1.5;margin:0 0 20px}
  input{width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:16px;margin-bottom:12px}
  button{width:100%;padding:13px;border:none;border-radius:10px;background:#635BFF;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
  button:disabled{opacity:.5;cursor:default}
  .err{color:#DC2626;font-size:13px;margin:-4px 0 12px;min-height:16px}
  .step{display:none}
  .step.active{display:block}
</style>
</head>
<body>
<div class="card">
  <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:22px"><img src="/vakilcard-pwa-192.png" alt="" style="height:28px;width:28px;border-radius:8px;object-fit:cover;flex:none;box-shadow:0 2px 6px rgba(0,0,0,.15)"><span style="font-weight:900;letter-spacing:-0.02em;color:#0f172a;font-size:17px">Vakilpedia<sup style="font-size:9px;font-weight:600;margin-left:1px;vertical-align:super">TM</sup></span><span style="border-radius:999px;background:#0f172a;color:#fff;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;padding:4px 9px">VakilCard</span></div>
  <div id="step-phone" class="step active">
    <h1>This card isn't public yet</h1>
    <p>@${esc(username)} is reserved but hasn't been published. Verify your phone number to pick up where you left off and finish setting it up.</p>
    <input id="phone" type="tel" inputmode="tel" placeholder="10-digit mobile number" autocomplete="tel">
    <div class="err" id="err-phone"></div>
    <button id="btn-send">Send code</button>
  </div>
  <div id="step-otp" class="step">
    <h1>Enter the code</h1>
    <p>We sent a 6-digit code on WhatsApp to <span id="phone-echo"></span>.</p>
    <input id="otp" type="tel" inputmode="numeric" maxlength="6" placeholder="6-digit code" autocomplete="one-time-code">
    <div class="err" id="err-otp"></div>
    <button id="btn-verify">Verify &amp; continue</button>
  </div>
  <div id="step-done" class="step">
    <h1>Verified 🎉</h1>
    <p>Taking you to setup…</p>
  </div>
</div>
<script>
(function(){
  var DASHBOARD = ${jsStr(DASHBOARD_SITE)};
  var phone = "";
  function show(id){ document.querySelectorAll(".step").forEach(function(s){ s.classList.remove("active"); }); document.getElementById(id).classList.add("active"); }
  function setErr(id, msg){ document.getElementById(id).textContent = msg || ""; }

  document.getElementById("btn-send").addEventListener("click", function(){
    setErr("err-phone", "");
    phone = document.getElementById("phone").value.trim();
    if (!phone) { setErr("err-phone", "Enter your phone number."); return; }
    var btn = this; btn.disabled = true; btn.textContent = "Sending…";
    fetch("/api/vakilcard/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", phone: phone }) })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
      .then(function(res){
        btn.disabled = false; btn.textContent = "Send code";
        if (!res.ok) { setErr("err-phone", res.d.error === "rate_limited" || res.d.error === "cooldown" ? "Too many attempts, try again shortly." : "Couldn't send the code. Check the number."); return; }
        document.getElementById("phone-echo").textContent = phone;
        show("step-otp");
      })
      .catch(function(){ btn.disabled = false; btn.textContent = "Send code"; setErr("err-phone", "Network error, try again."); });
  });

  document.getElementById("btn-verify").addEventListener("click", function(){
    setErr("err-otp", "");
    var code = document.getElementById("otp").value.trim();
    if (!code) { setErr("err-otp", "Enter the code."); return; }
    var btn = this; btn.disabled = true; btn.textContent = "Verifying…";
    fetch("/api/vakilcard/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", phone: phone, code: code }) })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
      .then(function(res){
        if (!res.ok) { btn.disabled = false; btn.textContent = "Verify & continue"; setErr("err-otp", "Incorrect or expired code."); return; }
        show("step-done");
        // Same fragment-token bridge as the NFC claim flow — see App.js.
        var dest = (res.d.published && res.d.card_url)
          ? res.d.card_url
          : DASHBOARD + "/setup#at=" + encodeURIComponent(res.d.access_token) + "&rt=" + encodeURIComponent(res.d.refresh_token);
        setTimeout(function(){ window.location.href = dest; }, 700);
      })
      .catch(function(){ btn.disabled = false; btn.textContent = "Verify & continue"; setErr("err-otp", "Network error, try again."); });
  });
})();
</script>
</body>
</html>`;
}

function jsonLd(p, url) {
  const office = p.offices[0] || {};
  const data = {
    "@context": "https://schema.org",
    "@type": "Attorney",
    name: p.full_name,
    url,
    ...(p.photo_url ? { image: p.photo_url } : {}),
    ...(p.designation ? { jobTitle: p.designation } : {}),
    ...(p.bio ? { description: p.bio } : {}),
    ...(p.practice_areas.length ? { knowsAbout: p.practice_areas } : {}),
    ...(p.languages && p.languages.length ? { knowsLanguage: p.languages } : {}),
    ...(p.show_phone !== false && p.phone ? { telephone: p.phone } : {}),
    ...(p.show_email !== false && p.email ? { email: p.email } : {}),
    ...(office.address
      ? { address: { "@type": "PostalAddress", streetAddress: office.address } }
      : {}),
  };
  return JSON.stringify(data);
}

/* -------- social links: server mirror of lib/vakilcardNormalize -------- */
// The stored key IS the platform (set by the wizard), so the card's icon can
// never mismatch the destination. We defensively re-normalize here so even
// legacy raw values ("linkedin.com/in/x", "@handle") render as working links;
// anything unrecognizable is dropped — never a dead or wrong icon.
const SOCIAL_ORDER = ["linkedin", "facebook", "instagram", "x", "threads", "youtube", "telegram", "whatsapp", "barcouncil"];
const SOCIAL_HOSTS = {
  linkedin: [/(^|\.)linkedin\.com$/i, (h) => `https://www.linkedin.com/in/${h}`],
  x: [/(^|\.)(x|twitter)\.com$/i, (h) => `https://x.com/${h}`],
  instagram: [/(^|\.)instagram\.com$/i, (h) => `https://www.instagram.com/${h}`],
  youtube: [/(^|\.)(youtube\.com|youtu\.be)$/i, (h) => `https://www.youtube.com/@${h}`],
  facebook: [/(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com)$/i, (h) => `https://www.facebook.com/${h}`],
  threads: [/(^|\.)(threads\.net|threads\.com)$/i, (h) => `https://www.threads.net/@${h}`],
  telegram: [/(^|\.)(t\.me|telegram\.me)$/i, (h) => `https://t.me/${h}`],
};
function normalizeSocialServer(key, raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  if (key === "whatsapp") {
    const digits = v.replace(/\D/g, "");
    if (/wa\.me|whatsapp\.com/i.test(v) && /^https?:\/\//i.test(v)) return v.replace(/^http:\/\//i, "https://");
    if (digits.length === 10 && /^[6-9]/.test(digits)) return `https://wa.me/91${digits}`;
    if (digits.length >= 11 && digits.length <= 15) return `https://wa.me/${digits.replace(/^0+/, "")}`;
    return null;
  }
  if (/^https?:\/\//i.test(v) || /^www\./i.test(v)) {
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      const spec = SOCIAL_HOSTS[key];
      if (spec && !spec[0].test(u.hostname)) return null; // URL for the wrong platform
      return `https://${u.hostname}${u.pathname.replace(/\/+$/, "")}${u.search || ""}`;
    } catch { return null; }
  }
  const spec = SOCIAL_HOSTS[key];
  const handle = v.replace(/^@/, "");
  if (spec && /^[a-zA-Z0-9._\-]{1,100}$/.test(handle)) return spec[1](handle);
  if (key === "barcouncil") return null; // needs a full URL
  return null;
}
function socialList(social_links) {
  const out = [];
  for (const key of SOCIAL_ORDER) {
    const n = normalizeSocialServer(key, (social_links || {})[key]);
    if (n) out.push([key, n]);
  }
  return out;
}

/** Map a DB profile row (with joined offices/payment/areas) to the Design
 *  System component's `profile` prop shape (see the handoff README). */
function toDsProfile(p) {
  const office = p.offices[0] || {};
  const chamber = (office.chamber_name || "").trim();
  const chamberWords = chamber.split(/\s+/).filter(Boolean);
  const nameParts = (p.full_name || "")
    .replace(/^adv(ocate)?\.?\s*/i, "")
    .trim()
    .split(/\s+/);
  const firmShort = chamberWords[0] || nameParts[nameParts.length - 1] || "Chambers";
  // 2026-08-16: firmSub used to default to the literal "LAW CHAMBERS"
  // whenever chamber_name had 0 or 1 words — wrong for solo practitioners,
  // associates, or any non-chambers practice, and impossible to opt out of.
  // Now: an explicit chamber_type field wins when the lawyer has set one
  // (the intentional, discoverable way to customize this caption); falls
  // back to any extra words already typed into chamber_name (unchanged
  // legacy behavior for existing users relying on that); otherwise the
  // caption is omitted entirely rather than fabricated. Mirrored client-side
  // in src/lib/vakilcardNormalize.js formToDsProfile() — keep both in sync.
  const chamberType = (office.chamber_type || "").trim();
  const firmSub = (chamberType || chamberWords.slice(1).join(" ")).toUpperCase();
  const addrParts = (office.address || "").split(/,\s*/).filter(Boolean);
  const mid = Math.ceil(addrParts.length / 2);
  const contacts = [];
  if (p.show_phone !== false && p.phone) contacts.push(["phone", p.phone]);
  if (p.show_email !== false && p.email) contacts.push(["mail", p.email]);
  if (addrParts.length) contacts.push(["pin", addrParts.slice(-2).join(", ")]);
  if (p.enrollment_number) contacts.push(["scale", `Enrol. No. ${p.enrollment_number}`]);
  const pay = p.payment;
  // Exposed directly to the client component (2026-08-16 fix batch): the
  // merged payment pill needs to know Free vs Pro itself now (QR shown only
  // for Pro, Pay Now locked + upsell for Free) — previously only the
  // server-side `links` object (mount.js's wiring layer) knew this.
  const pro = isProActive(p);
  return {
    pro,
    firmShort,
    firmSub,
    tagline:
      (p.practice_areas || []).slice(0, 3).join(" · ") ||
      "Litigation · Advisory · Drafting",
    title: "ADVOCATE",
    name: p.full_name,
    username: p.username,
    photoUrl: p.photo_url || "",
    contacts,
    about: p.bio || "",
    practice: p.practice_areas || [],
    upi: pay && pay.show_upi !== false ? pay.upi_id || "" : "",
    // Free users' own uploaded QR — shown (and downloaded) exactly as uploaded;
    // when absent the card draws a valid QR from the UPI ID instead.
    payQrUrl: pay && pay.show_upi !== false ? pay.upi_qr_url || "" : "",
    social: socialList(p.social_links),
    // Same fix as firmSub above: no more fabricated "Law Chambers" — the
    // Office/Google Business section already hides this line entirely when
    // falsy (see VakilCardApp.jsx), so an honest empty string is correct.
    firm: chamber || "",
    address: [
      addrParts.slice(0, mid).join(", "),
      addrParts.slice(mid).join(", "),
    ],
    // card_theme (default/midnight/ivory) is exposed for the component/CSS
    // layer to consume; the DS's visual theme variants themselves are a
    // separate design-system task — see the phase report's open items.
    cardTheme: p.card_theme || "default",
    // Google Business tile — shown to FREE AND PRO alike. Founder, 29 Aug
    // 2026: "I wanted the user's Google Business profile visible in the
    // VakilCard for both free and pro users." Pro does not buy the tile; it
    // buys the one-tap Leave-a-Review action on it (links.review below).
    // Until 2026-08-29 this was Pro-gated and a Free advocate's listing was
    // invisible on their own card.
    //
    // Only DISPLAY data ships here — the destination stays in
    // links.googleBusiness, which mount.js opens externally, matching every
    // other tile.
    //
    // rating/reviewCount are REAL now. The component has always been able to
    // render them ("server-supplied only" in VakilCardApp.jsx) and nothing
    // could ever supply them: the OAuth path did not return them, and the
    // Business Profile Reviews API needs its own Google quota approval. The
    // Places API returns both, and booking.js's places_link caches them on the
    // row at link time — so a public card never triggers a billable Places
    // call. Absent when the owner has not linked a listing, and the component
    // shows honest unrated copy rather than fabricating stars.
    googleBusiness:
      p.google_business_url || p.google_business_embed || office.maps_url
        ? {
            name: p.google_business_name || chamber || p.full_name,
            address: addrParts.slice(-2).join(", ") || null,
            ...(typeof p.google_rating === "number" ? { rating: p.google_rating } : {}),
            ...(Number.isFinite(p.google_review_count)
              ? { reviewCount: p.google_review_count }
              : {}),
          }
        : null,
  };
}

/** Real intents for the wiring layer (mount.js). Null = tile stays visual. */

// Normalize + validate the lawyer's website; an invalid link is HIDDEN from
// the card rather than served broken. (Mirror of lib/vakilcardNormalize.)
function safeWebsite(raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v.replace(/^http:\/\//i, "https://") : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:") return null;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(u.hostname)) return null;
    return withScheme;
  } catch {
    return null;
  }
}

function buildLinks(p, pro = false) {
  const office = p.offices[0] || {};
  const phone = p.show_phone !== false ? cleanPhone(p.phone) : "";
  const wa = cleanPhone(p.whatsapp || p.phone);
  const pay = p.payment;
  let upi = null;
  // Native upi:// intents are a Pro feature; free cards pay via the
  // uploaded QR + UPI ID (mount.js). Only a syntactically valid VPA gets a
  // live pay intent — a broken UPI ID must never produce a dead flow.
  if (pro && pay && pay.upi_id && pay.show_upi !== false && /^[a-z0-9][a-z0-9.\-_]{1,48}@[a-z][a-z0-9]{1,30}$/i.test(pay.upi_id.trim())) {
    const params = new URLSearchParams({ pa: pay.upi_id.trim(), pn: p.full_name, cu: "INR" });
    if (pay.consultation_fee) params.set("am", String(pay.consultation_fee));
    upi = `upi://pay?${params.toString()}`;
  }
  return {
    tel: phone ? `tel:${phone}` : null,
    whatsapp: wa ? `https://wa.me/${wa.replace(/^\+/, "")}` : null,
    mailto: p.show_email !== false && p.email ? `mailto:${p.email}` : null,
    upi,
    maps:
      office.maps_url ||
      (office.address
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(office.address)}`
        : null),
    website: pro ? safeWebsite(p.website) : null, // website is Pro-only
    vcf: `/api/vakilcard/vcf?username=${encodeURIComponent(p.username)}`,
    // Reviews, and THE Pro line in this whole feature.
    //
    // links.review is Google's own writeAReviewUri, returned by the Places API
    // and cached at link time (booking.js places_link). It opens the review
    // form with the listing already chosen — the client just types and taps.
    // That one-tap path is what Pro buys. It is real again as of 2026-08-29:
    // between the OAuth removal and the Places work, nothing could populate
    // this column at all, and before that the code built a fake link by
    // string-matching a Maps CID.
    //
    // A FREE advocate's card is never left with a dead button. It falls to
    // reviewView, the listing itself, where a visitor can still read reviews
    // and leave one through Google's UI — a couple of taps more, which is
    // exactly the convenience Pro is selling. The upgrade prompt belongs in
    // the OWNER'S dashboard, not on a card their client is holding: the client
    // cannot upgrade anyone's plan, and "Upgrade to Pro" on an advocate's card
    // reads as the advocate asking them for money.
    review: pro && p.google_review_link ? p.google_review_link : null,
    reviewView: office.maps_url || p.google_business_url || null,
    // Google Business tile destination — FREE AND PRO. See the tile itself in
    // toDsProfile(); Pro buys the review action, not the listing.
    googleBusiness: p.google_business_url || office.maps_url || null,
  };
}

/**
 * SSR shell around the Design System card.
 * mode: "live" (public card) | "preview" (owner draft preview) | "demo"
 * (marketing showcase — the DS's own demo profile, no DB round-trip).
 */
function renderPage(p, themeOverride, mode = "live") {
  const demo = mode === "demo";
  const theme = themeOverride === "light" ? "light" : "dark"; // DS is dark-first
  const url = demo ? DASHBOARD_SITE : `${SITE}/${p.username}`;
  const title = demo
    ? "VakilCard — Interactive Demo | Vakilpedia"
    : `${p.full_name}${p.designation ? " — " + p.designation : ""} | VakilCard`;
  const desc = demo
    ? "Experience a live VakilCard — the premium digital visiting card for advocates."
    : p.bio ||
      `${p.full_name}${p.practice_areas.length ? " · " + p.practice_areas.slice(0, 3).join(", ") : ""} — digital chamber card on Vakilpedia.`;

  // Entitlements are resolved SERVER-SIDE only; the page receives final
  // decisions (pro flag + already-gated links), never raw plan data to
  // re-evaluate. Demo renders as Pro (it showcases the full product).
  const pro = demo ? true : isProActive(p);
  const links = demo ? null : buildLinks(p, pro);
  // Per-action availability drives the card's Connect tiles: an action with no
  // real target (no phone, no website, invalid maps, …) renders as a disabled,
  // greyed tile — never a dead button. Demo omits this so the showcase is fully
  // live. Keys mirror the tile action keys in VakilCardApp.
  let dsProfile = null;
  if (!demo) {
    dsProfile = toDsProfile(p);
    dsProfile.actions = {
      call: !!links.tel,
      whatsapp: !!links.whatsapp,
      directions: !!links.maps,
      email: !!links.mailto,
      website: !!links.website,
      reviews: !!(links.review || links.reviewView),
    };
    dsProfile.reviewLabel = links.review ? "Leave a Review" : links.reviewView ? "View Reviews" : "Reviews";
  }
  // Branding: hide_branding is null (auto — hides iff Pro, the original
  // behaviour) unless the owner explicitly overrode it (Pro-only write,
  // guarded in me.js). true/false always win over the plan default.
  const hideBranding = demo ? true : typeof p.hide_branding === "boolean" ? p.hide_branding : pro;
  const boot = demo
    ? { demo: true, theme, pro: true }
    : {
        profile: dsProfile,
        links,
        profileId: mode === "live" ? p.id : null,
        preview: mode === "preview",
        url,
        theme,
        pro,
        // Owner dashboard origin — mount.js builds owner-facing URLs (Edit
        // chip, upgrade links) from this instead of hardcoding paths.
        dash: DASHBOARD_SITE,
        // Card-visible Pro features this card does NOT have, straight from the
        // entitlement layer. [] for Pro.
        //
        // SAFE TO CACHE, AND THAT IS THE POINT. This describes the CARD's plan,
        // which is identical for everyone who loads it, so the SSR response
        // stays behind `Cache-Control: public, s-maxage=3600` exactly as
        // before. It carries no VALUES a Free plan withholds — the website URL
        // is still omitted above — only the fact that the feature is locked.
        //
        // Whether to PITCH any of this is decided client-side, and only when
        // mount.js has detected the owner. A client looking at their lawyer's
        // card must never be shown the lawyer's upgrade offer.
        locked: lockedCardFeatures(p),
        // Consultation fee (₹) for the Pro pay sheet's default option.
        fee:
          p.payment && p.payment.show_upi !== false && Number(p.payment.consultation_fee) > 0
            ? Number(p.payment.consultation_fee)
            : null,
        // Free pay experience: the lawyer's own uploaded QR + UPI ID text.
        payQr: p.payment && p.payment.show_upi !== false ? p.payment.upi_qr_url || null : null,
        upiId: p.payment && p.payment.show_upi !== false ? p.payment.upi_id || null : null,
      };

  const seoHead = demo
    ? `<meta name="robots" content="noindex">`
    : `<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${p.photo_url ? `<meta property="og:image" content="${esc(p.photo_url)}">` : `<meta property="og:image" content="${SITE}/vakilcard_og.jpg">`}
<meta property="og:site_name" content="Vakilpedia">
<meta name="twitter:card" content="${p.photo_url ? "summary" : "summary_large_image"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${p.photo_url ? esc(p.photo_url) : `${SITE}/vakilcard_og.jpg`}">
<script type="application/ld+json">${jsonLd(p, url)}</script>
<link rel="manifest" href="/api/vakilcard/manifest?username=${esc(p.username)}">
<link rel="apple-touch-icon" href="/vakilcard-pwa-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${esc((p.full_name || '').replace(/^adv(ocate)?\.?\s*/i, '').split(/\s+/)[0] || 'VakilCard')} - VakilCard">
<meta name="theme-color" content="#050508">`;

  // <base> lets the component's own relative asset refs
  // (../../assets/logos/vakilpedia.png) resolve under /ds/ — the deployed
  // bundle mirrors the design export's directory layout for this reason.
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<!-- The Design System card is authored at a FIXED 412px viewport. Laying
     out at width=412 and letting the browser auto-scale to the device keeps
     tile ratios, icons and typography pixel-faithful on every phone —
     narrower viewports would otherwise squeeze and clip the design. -->
<meta name="viewport" content="width=412">
<base href="/ds/ui_kits/vakilcard/">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${seoHead}
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/ds/styles.css">
<link rel="stylesheet" href="/ds/page.css">
<style>
/* ============ App-stage scaling — native-app layout stability ============
   The DS card is authored at a FIXED 412px composition. Geometry (tile
   ratios, spacing, type) must NEVER reflow with the viewport or browser
   zoom. So the card is laid out at exactly 412px always, and the whole
   stage is uniformly scaled to fit:

     scale = min(density, viewportWidth / 412)

   - density: 1 on phones (full-bleed native feel), 0.8 on desktop (the
     approved reference density).
   - The viewport guard means NO horizontal overflow or clipping at ANY
     browser zoom or window size — zoom shrinks the CSS viewport, the
     stage scales down with it, proportions stay pixel-identical.
   - The page itself never scrolls (overflow hidden); only the card's
     chamber scrolls — exactly like a native iOS app.
   Fallback: browsers without length-division calc keep the density scale. */
html, body { overflow: hidden; height: 100%; touch-action: manipulation; }
/* Double-tap-to-zoom off (native-app feel, and stops it fighting the QR
   double-tap-to-download gesture) while pinch-zoom accessibility stays
   intact — touch-action: manipulation removes only the double-tap gesture
   and the ~300ms tap delay, it does not disable pinch. */
/* Scroll must feel native: contain overscroll so the chamber never chains
   into the (locked) page and gets stuck at its edges (iOS Safari). */
.vp-scroll { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
/* Phones: NO transform — the viewport meta (width=412) already fits the
   authored geometry to the device natively, and iOS Safari scrolling
   inside transformed containers is glitchy. Desktop only gets the stage
   scale below. */
@media (min-width: 768px) {
  #root {
    --s: 0.8;
    --s: min(0.8, calc(100vw / 412));
    width: 412px;
    height: 100vh;
    height: calc(100dvh / var(--s));
    margin: 0 auto;
    transform: scale(var(--s));
    transform-origin: top center;
  }
}
</style>
</head>
<body>
<div id="root"></div>
${hideBranding ? "" : `<a href="${DASHBOARD_SITE}" id="vc-branding" style="position:fixed;left:50%;transform:translateX(-50%);bottom:8px;z-index:97;display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:999px;background:rgba(10,10,16,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.75);font:700 10.5px system-ui,sans-serif;letter-spacing:.04em;text-decoration:none">Powered by Vakilpedia</a>`}
<script>window.__VAKILCARD_BOOT__ = ${JSON.stringify(boot).replace(/</g, "\\u003c")};</script>
<script src="/ds/react.production.min.js"></script>
<script src="/ds/react-dom.production.min.js"></script>
<script src="/ds/_ds_bundle.js"></script>
<script src="/ds/ui_kits/vakilcard/VakilCardApp.js"></script>
<script src="/ds/mount.js"></script>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  if (req.method === "POST") {
    // This is an ALLOWLIST for events arriving from the wild, so entries are
    // retired on a different clock from the code that fires them.
    //
    // "google_review" STAYS even though public/ds/mount.js stopped emitting it
    // on 2026-08-29. Visitors hold mount.js in their browser cache, and an old
    // copy will keep posting that event for as long as its cache entry lives.
    // Dropping the entry today would turn those into rejected requests and put
    // a hole in the analytics of cards that are working perfectly well. It
    // costs one string to keep; remove it in a later pass once the cached
    // bundles have aged out.
    const PROFILE_EVENTS = new Set([
      "view", "share", "call", "whatsapp", "email", "pay", "directions",
      "save_contact", "appointment", "website", "qr_download", "social_click",
      "draft_created", "profile_25", "profile_50", "profile_75", "published",
      "nfc_tap", "google_review", "google_business", "payment_claimed",
    ]);
    const FUNNEL_EVENTS = new Set(["cta_click", "otp_started", "otp_verified"]);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    try {
      const body = await readJsonBody(req);
      const pid = body.profile_id ? String(body.profile_id) : null;
      const ev = String(body.event_type || "");
      const referrer = req.headers["referer"];
      if (pid && UUID_RE.test(pid) && PROFILE_EVENTS.has(ev)) {
        await trackEvent(pid, ev, referrer);
      } else if (!pid && FUNNEL_EVENTS.has(ev)) {
        await trackEvent(null, ev, referrer);
      }
      res.statusCode = 204;
      res.end();
    } catch (e) {
      res.statusCode = 500;
      res.end();
    }
    return;
  }

  // Interactive product demo: the DS's own showcase profile, no DB round-trip.
  if (req.query.demo === "1") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("X-Robots-Tag", "noindex");
    res.end(renderPage(null, req.query.theme, "demo"));
    return;
  }
  const username = String(req.query.username || "").replace(/^@/, "").toLowerCase();
  try {
    const hit = await resolveProfileOrAlias(username);
    // Alias (old phone URL, previous username): permanent redirect — links never break.
    if (hit && hit.redirectTo) {
      res.statusCode = 301;
      res.setHeader("Location", `/${hit.redirectTo}`);
      res.setHeader("Cache-Control", "public, s-maxage=3600");
      res.end();
      return;
    }
    // Owner live preview of a draft: pid-bound signed token from GET /me —
    // renders the REAL component (the wizard iframes this).
    if (hit && hit.draft && req.query.pt) {
      const claims = verifyJwt(String(req.query.pt));
      if (claims && claims.typ === "preview" && claims.pid === hit.profile.id) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Robots-Tag", "noindex");
        res.end(renderPage(hit.profile, req.query.theme, "preview"));
        return;
      }
    }
    // Draft card: URL reserved, nothing public or indexable yet — but this is
    // also exactly where the WhatsApp welcome link and a re-tap of a still-
    // draft physical card land, so it must offer a real way forward (verify
    // your phone, resume setup) rather than a dead end. 2026-08-15 kiosk fix.
    if (hit && hit.draft) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex");
      res.end(finishSetupPage(username));
      return;
    }
    const p = hit && hit.profile;
    if (!p) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found | VakilCard</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:linear-gradient(120deg,#CDEFFB,#FDEECB)"><div style="text-align:center"><h1 style="font-weight:900">Card not found</h1><p>No VakilCard exists at @${esc(username)}.</p><p><a href="${DASHBOARD_SITE}" style="color:#635BFF;font-weight:700">Claim this username →</a></p></div></body></html>`
      );
      return;
    }
    // Admin suspension overrides is_published entirely — a suspended card
    // is never reachable by its owner re-toggling their own publish state.
    if (p.is_suspended) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex");
      res.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Temporarily unavailable | VakilCard</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:linear-gradient(120deg,#CDEFFB,#FDEECB)"><div style="text-align:center;padding:24px"><h1 style="font-weight:900">This VakilCard is temporarily unavailable</h1><p style="color:#475569">Contact Vakilpedia support if you believe this is a mistake.</p></div></body></html>`
      );
      return;
    }
    // Server-side view tracking (crawlers excluded by UA heuristic).
    const ua = String(req.headers["user-agent"] || "");
    if (!/bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram/i.test(ua)) {
      trackEvent(p.id, "view", req.headers["referer"]);
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    // Marks live cards for the PWA service worker (vakilcard-sw.js): only
    // responses carrying this header are kept for offline launch.
    res.setHeader("X-VakilCard", "live");
    res.end(renderPage(p, req.query.theme, "live"));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("VakilCard is temporarily unavailable.");
  }
};
