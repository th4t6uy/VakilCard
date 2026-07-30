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
  cleanPhone,
  resolveProfileOrAlias,
  trackEvent,
} = require("./_lib");
const { verify: verifyJwt } = require("./_jwt");
const { isProActive } = require("./_entitlements");

const SITE = "https://www.vakilpedia.com";

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
  const firmSub = (chamberWords.slice(1).join(" ") || "LAW CHAMBERS").toUpperCase();
  const addrParts = (office.address || "").split(/,\s*/).filter(Boolean);
  const mid = Math.ceil(addrParts.length / 2);
  const contacts = [];
  if (p.show_phone !== false && p.phone) contacts.push(["phone", p.phone]);
  if (p.show_email !== false && p.email) contacts.push(["mail", p.email]);
  if (addrParts.length) contacts.push(["pin", addrParts.slice(-2).join(", ")]);
  if (p.enrollment_number) contacts.push(["scale", `Enrol. No. ${p.enrollment_number}`]);
  const pay = p.payment;
  return {
    firmShort,
    firmSub,
    tagline:
      (p.practice_areas || []).slice(0, 3).join(" · ") ||
      "Litigation · Advisory · Drafting",
    title: "ADVOCATE",
    name: p.full_name,
    photoUrl: p.photo_url || "",
    contacts,
    about: p.bio || "",
    practice: p.practice_areas || [],
    upi: pay && pay.show_upi !== false ? pay.upi_id || "" : "",
    // Free users' own uploaded QR — shown (and downloaded) exactly as uploaded;
    // when absent the card draws a valid QR from the UPI ID instead.
    payQrUrl: pay && pay.show_upi !== false ? pay.upi_qr_url || "" : "",
    social: socialList(p.social_links),
    firm: chamber || `${firmShort} Law Chambers`,
    address: [
      addrParts.slice(0, mid).join(", "),
      addrParts.slice(mid).join(", "),
    ],
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
  const url = demo ? `${SITE}/vakilcard` : `${SITE}/${p.username}`;
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
    };
  }
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
html, body { overflow: hidden; height: 100%; }
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
${pro ? "" : `<a href="${SITE}/vakilcard" id="vc-branding" style="position:fixed;left:50%;transform:translateX(-50%);bottom:8px;z-index:97;display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:999px;background:rgba(10,10,16,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.75);font:700 10.5px system-ui,sans-serif;letter-spacing:.04em;text-decoration:none">Powered by Vakilpedia</a>`}
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
    // Draft card: URL reserved, nothing public or indexable.
    if (hit && hit.draft) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Robots-Tag", "noindex");
      res.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not published yet | VakilCard</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:linear-gradient(120deg,#CDEFFB,#FDEECB)"><div style="text-align:center;padding:24px"><h1 style="font-weight:900">This card isn&#39;t published yet</h1><p style="color:#475569">The address is reserved. Check back soon.</p></div></body></html>`
      );
      return;
    }
    const p = hit && hit.profile;
    if (!p) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found | VakilCard</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:linear-gradient(120deg,#CDEFFB,#FDEECB)"><div style="text-align:center"><h1 style="font-weight:900">Card not found</h1><p>No VakilCard exists at @${esc(username)}.</p><p><a href="${SITE}/vakilcard" style="color:#635BFF;font-weight:700">Claim this username →</a></p></div></body></html>`
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
