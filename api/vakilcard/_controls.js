// The admin panel's per-app switches, as VakilCard sees them. 2026-09-26.
//
// admin.vakilpedia.com -> Apps -> VakilCard -> Controls saves four switches into
// supracore.product_controls: maintenance (+ message), a notice, purchases on/off and
// sign-ups on/off. The public RPC supracore_product_controls_public(p_product_id) returns
// them. This is the server-side reader; the SPA gets the same answer through
// POST /api/vakilcard/auth {action:"controls"} (folded into auth.js on purpose: this
// deployment sits at Vercel's 12-serverless-function ceiling, so it must not gain a new
// endpoint file -- see booking.js).
//
// FAIL OPEN, ALWAYS. If the read fails for any reason -- network, timeout, bad key, a
// malformed reply -- the answer is "nothing is switched off". A control outage must never
// lock people out of their card; these switches exist for the founder to restrict things
// DELIBERATELY. Same rule and same shape as the web apps' src/lib/controls/productControls.ts.
//
// Cached in-process for 60 s (15 s after a failed read). Vercel keeps a warm lambda for a
// while, so this is one read a minute per instance, not one per request.
//
// Dependency-free like the rest of api/vakilcard. Underscore prefix keeps Vercel from
// deploying this file as an endpoint.

const PRODUCT_ID = "vakilcard";
const TTL_OK_MS = 60 * 1000;
const TTL_FAILED_MS = 15 * 1000;

const MESSAGES = {
  purchases: "New purchases are paused for now. Everything you already have keeps working.",
  signups: "New sign-ups are paused for now. Existing accounts are not affected.",
  maintenance: "We're doing some maintenance. Some things may be slow or briefly unavailable.",
};

function defaults(productId = PRODUCT_ID) {
  return {
    productId,
    maintenance: false,
    maintenanceMessage: null,
    notice: null,
    purchasesEnabled: true,
    signupsEnabled: true,
  };
}

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Only an explicit false switches purchases/sign-ups off and only an explicit true switches
// maintenance on; anything missing or odd-typed means "not restricted". Expired notices are
// dropped here as well as in the RPC (the RPC answer is cached for up to a minute).
function normalizeControls(raw, productId = PRODUCT_ID, now = new Date()) {
  const base = defaults(productId);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;

  let notice = null;
  const n = raw.notice;
  if (n && typeof n === "object") {
    const body = str(n.body);
    const until = str(n.until);
    const expired = until !== null && !Number.isNaN(Date.parse(until)) && Date.parse(until) <= now.getTime();
    if (body && !expired) {
      const level = ["info", "warning", "critical"].includes(n.level) ? n.level : "info";
      notice = { title: str(n.title), body, level, until };
    }
  }
  const maintenance = raw.maintenance === true;
  return {
    productId,
    maintenance,
    maintenanceMessage: maintenance ? str(raw.maintenanceMessage) : null,
    notice,
    purchasesEnabled: raw.purchasesEnabled !== false,
    signupsEnabled: raw.signupsEnabled !== false,
  };
}

const cache = new Map(); // productId -> { until, value }

// Any working key will do: the RPC is public (anon-executable). The service key is already
// configured here, so no new environment variable is needed to switch this on.
function credentials(env) {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url, key };
}

async function getControls({ productId = PRODUCT_ID, fetchImpl, env = process.env, nowMs = Date.now(), timeoutMs = 3000 } = {}) {
  const hit = cache.get(productId);
  if (hit && hit.until > nowMs) return hit.value;

  const { url, key } = credentials(env);
  let raw = null;
  if (url && key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await (fetchImpl || fetch)(`${url}/rest/v1/rpc/supracore_product_controls_public`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_product_id: productId }),
        signal: controller.signal,
      });
      if (r.ok) raw = await r.json();
    } catch {
      raw = null; // fail open
    } finally {
      clearTimeout(timer);
    }
  }
  const value = normalizeControls(raw, productId, new Date(nowMs));
  cache.set(productId, { until: nowMs + (raw !== null ? TTL_OK_MS : TTL_FAILED_MS), value });
  return value;
}

function clearCache() {
  cache.clear();
}

module.exports = { PRODUCT_ID, MESSAGES, defaults, normalizeControls, getControls, clearCache };
