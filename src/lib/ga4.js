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
// picks up react-router navigation automatically — no per-route call needed.
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
