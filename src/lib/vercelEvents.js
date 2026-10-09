/**
 * Sends a named action to Vercel's own visitor counter (Web Analytics custom events).
 * ONE name everywhere: callers pass the same event name they send to GA4, so the two tools line up.
 * Cookie-free and anonymous: only simple values go out; anything a visitor typed, and page/URL details, are left out.
 * Never throws; a no-op where Vercel's script is absent (localhost) or before it loads (the stub in the page head queues it).
 */
const NEVER_SEND = new Set(["search_term", "link_text", "email", "phone", "name", "password", "token"]);
const SKIP_PREFIX = ["page_", "landing_", "first_user_", "utm_"];

export function trackVercelEvent(name, params) {
  try {
    if (typeof window === "undefined" || !name) return;
    const va = window.va;
    if (typeof va !== "function") return;
    if (params && params.traffic_type === "internal") return;
    const data = {};
    for (const [k, v] of Object.entries(params || {})) {
      if (NEVER_SEND.has(k) || SKIP_PREFIX.some((p) => k.startsWith(p))) continue;
      if (typeof v === "string") data[k] = v.slice(0, 100);
      else if (typeof v === "number" || typeof v === "boolean") data[k] = v;
    }
    va("event", { name, data });
  } catch {
    /* counting must never break the page */
  }
}
