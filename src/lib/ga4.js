// Google Analytics 4 — shared Vakilpedia measurement ID.
//
// VakilCard had no analytics tag at all (confirmed 2026-09-17: zero GA hits
// from vakilcard.vakilpedia.com in the property, ever). This installs the
// same tag every other Vakilpedia app shares, gated to real production
// traffic only — it never fires on localhost or a Vercel preview
// deployment, so dev/preview builds can't pollute production analytics
// (matches the GA4 "Exclude Localhost and Vercel Dev" data filter).
//
// GA4's own Enhanced Measurement setting ("page changes based on browser
// history events") is on for this property, so once this tag is loaded it
// picks up react-router navigation automatically — no per-route call needed
// for a route that already has its title set BEFORE the navigation fires.
//
// BUG FIXED 2026-09-27: this app is a CRA single-page app — every route
// shares the one static <title>VakilCard</title> in public/index.html until
// React mounts and a page-level effect overwrites it (see SEOHead.js,
// VakilCardPage.js, SignupPage.js, SetupWizard.js). gtag.js is a tiny script
// served from Google's edge cache — on a cold visit it reliably finishes
// loading and fires GA4's automatic initial page_view BEFORE this app's own
// (much larger, uncached-on-first-visit) JS bundle has even parsed, let
// alone run its first effect. Confirmed in GA4 (Reports > Engagement > Pages
// and screens, grouped by title): the "VakilCard" title — the literal
// public/index.html placeholder, never anything a route sets on purpose —
// was the single largest "page" in the whole property, aggregating real
// dashboard/signup/setup/admin activity from a handful of users under one
// meaningless bucket instead of each screen's real title.
//
// Fix: don't let gtag send that automatic first hit at all
// (`send_page_view: false` below). Every real page_view GA4 receives from
// this app now comes from the explicit trackPageView() call each screen
// makes right after it sets document.title — so the title GA4 records can
// never be older than the title actually on screen. Enhanced Measurement's
// history-based auto-tracking (the comment above) still covers navigation
// GA4 doesn't need help with; this only removes the one hit that used to
// race the app's own bundle.
const GA4_ID = "G-ZN18SN3FZS";

// The full *.vakilpedia.com estate that shares this measurement ID
// (G-ZN18SN3FZS). Listing it here -- not just in GA4 Admin's "Configure
// your domains" panel -- makes cross-domain session continuity a property
// of the code, not a UI setting that can be silently reset or missed on a
// new subdomain: it stops Enhanced Measurement from firing a spurious
// "outbound_click" for a same-estate subdomain hop, and stops GA4 from
// starting a fresh session with a "Referral" source when a visitor crosses
// from one subdomain to another. Keep this list in sync across every app's
// ga4 module when a new *.vakilpedia.com subdomain goes live.
const GA4_LINKER_DOMAINS = [
  "vakilpedia.com",
  "www.vakilpedia.com",
  "account.vakilpedia.com",
  "vakilcard.vakilpedia.com",
  "barelex.vakilpedia.com",
  "affidavit.vakilpedia.com",
  "admin.vakilpedia.com",
  "caselinx.vakilpedia.com",
  "beta.caselinx.vakilpedia.com",
  "signlinx.vakilpedia.com",
  "suite.vakilpedia.com",
];

let initialized = false;

function isProductionHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (host.endsWith(".vercel.app")) return false;
  return true;
}

export function initGa4() {
  if (typeof window === "undefined") return;
  if (initialized) return;
  if (!isProductionHost()) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };
  window.gtag("js", new Date());
  window.gtag("config", GA4_ID, {
    linker: { domains: GA4_LINKER_DOMAINS },
    // See the note above trackPageView() below — this app sends its own,
    // correctly-titled page_view once it knows what's actually on screen.
    send_page_view: false,
  });

  const src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  if (!document.querySelector(`script[src="${src}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }

  initialized = true;
}

// Call this once a screen has set its REAL document.title (right after the
// `document.title = "..."` line, or from inside a title-setting component
// like SEOHead) — never from a loading/skeleton state, since that isn't a
// page a person actually saw. It's safe to call even before initGa4()'s
// external script has finished loading: gtag is a stub that queues into
// dataLayer regardless (same pattern initGa4() itself uses), so nothing is
// lost, and it's a no-op on localhost / Vercel previews, matching initGa4().
export function trackPageView(title) {
  if (typeof window === "undefined") return;
  if (!isProductionHost()) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };

  window.gtag("event", "page_view", {
    page_title: title,
    page_location: window.location.href,
    page_path: window.location.pathname + window.location.search,
  });
}
