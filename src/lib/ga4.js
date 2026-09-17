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
  window.gtag("config", GA4_ID);

  const src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  if (!document.querySelector(`script[src="${src}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }

  initialized = true;
}
