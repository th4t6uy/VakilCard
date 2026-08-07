// VakilCard entitlement layer — THE single source of truth for Free vs Pro.
// Every premium endpoint calls into this module; the frontend only ever
// mirrors decisions made here. Never trust the client.
//
// Plans: FREE (default) | PRO (₹199/yr founder-locked, ₹299/yr regular).
// Pro is entitled ONLY while plan=PRO, status=ACTIVE and not past expiry —
// EXPIRED/CANCELLED (and lapsed timestamps) behave exactly like FREE.

const PRICING = {
  founder_inr: 199,
  regular_inr: 299,
  period_days: 365,
};

/** Pro feature catalogue — extend here; gates everywhere update with it. */
const PRO_FEATURES = [
  "custom_username",
  "native_pay",
  "website",
  "booking",
  "analytics",
  "premium_themes",
  "remove_branding",
  "google_review",
  "google_business_embed",
];

function isProActive(profile) {
  if (!profile) return false;
  if (profile.subscription_plan !== "PRO") return false;
  if (profile.subscription_status !== "ACTIVE") return false;
  if (profile.subscription_expires_at && new Date(profile.subscription_expires_at) <= new Date())
    return false; // lapsed but not yet swept → behaves FREE immediately
  return true;
}

/** Entitlement summary shipped to the owner's own clients (GET /me). */
function entitlementsFor(profile) {
  const pro = isProActive(profile);
  const features = {};
  for (const f of PRO_FEATURES) features[f] = pro;
  return {
    plan: pro ? "PRO" : "FREE",
    pro,
    status: profile ? profile.subscription_status || "ACTIVE" : "ACTIVE",
    expires_at: (profile && profile.subscription_expires_at) || null,
    founder_pricing: !!(profile && profile.founder_pricing),
    features,
    pricing: PRICING,
  };
}

/**
 * Guard helper for premium endpoints. Returns true when allowed; otherwise
 * writes the standard 402 and returns false. The response is deliberately
 * uniform and leaks nothing about the premium functionality itself.
 */
function requirePro(res, profile, feature) {
  if (isProActive(profile)) return true;
  res.statusCode = 402;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ error: "pro_required", feature }));
  return false;
}

module.exports = { PRICING, PRO_FEATURES, isProActive, entitlementsFor, requirePro };
