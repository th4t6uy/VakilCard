// VakilCard: ONE front door for named actions. The same name goes to GA4 and to Vercel's counter
// (founder, 9 Oct 2026), so the tools line up. Page views are NOT sent from here (see lib/ga4.js).
import { trackVercelEvent } from "./vercelEvents";

// Names that differ between this app's own funnel beacon and the Vakilpedia-wide names: the wide name wins in GA4 + Vercel.
const RENAMES = { cta_click: "cta_clicked" };

export function trackEvent(name, params) {
  try {
    if (typeof window === "undefined" || !name) return;
    const event = RENAMES[name] || name;
    const payload = { product: "vakilcard", ...(params || {}) };
    if (typeof window.gtag === "function") window.gtag("event", event, payload); // gtag exists only on real production hosts
    trackVercelEvent(event, payload);
  } catch {
    /* analytics must never break the page */
  }
}
