// VakilCard entitlement layer — THE single source of truth for Free vs Pro.
// Every premium endpoint calls into this module; the frontend only ever
// mirrors decisions made here. Never trust the client.
//
// Plans: FREE (default) | PRO (founder-locked ₹199/yr, regular ₹299/yr — the
// PRICES live in supracore.billing_plans, keys vakilcard_pro_founder /
// vakilcard_pro, read through _billing.js getPricing()).
// Pro is entitled ONLY while plan=PRO, status=ACTIVE and not past expiry —
// EXPIRED/CANCELLED (and lapsed timestamps) behave exactly like FREE.
//
// Since 2026-09-10 these columns are a PROJECTION of the platform's
// product_entitlements row for product 'vakilcard' (trigger
// vakilcard_mirror_entitlement, SupraCore migration 20260910000200): the
// platform settles every charge and grants the entitlement; the trigger keeps
// vakilcard_profiles in step so nothing below had to change.

/**
 * COLD-START FALLBACK ONLY — these are NOT the prices. The catalogue
 * (supracore.billing_plans) is, and the platform prices every mandate from it.
 * This object exists so a GET /subscription during a catalogue outage renders
 * the numbers VakilCard has always shown instead of a blank sheet, and so the
 * entitlement unit tests need no database. Same pattern as CaseLinx's
 * LEGACY_CREDIT_COSTS (src/lib/creditCosts.ts). Changing a number here changes
 * nothing that is charged. Callers that need live values use
 * _billing.js getPricing() and pass the result to entitlementsFor().
 */
const PRICING = Object.freeze({
  founder_inr: 199,
  regular_inr: 299,
  period_days: 365,
});

/** Pro feature catalogue — extend here; gates everywhere update with it. */
const PRO_FEATURES = [
  "custom_username",
  "native_pay",
  "website",
  "booking",
  "analytics",
  "premium_themes",
  "remove_branding",
  // "google_review" is LIVE. Correcting a stale note that stood here and was
  // believed twice: it said the feature had been removed with the Google
  // Business OAuth flow and that "nothing can populate google_review_link any
  // more". True for two commits. 9140920 dropped the business.manage OAuth
  // scope, and 73708b4 -- "the review feature back for real" -- restored it
  // through the PLACES API, which returns Google's own
  // googleMapsLinks.writeAReviewUri. booking.js's places_link writes that
  // column today, and production has rows proving it.
  //
  // Verify against the DATA before acting on a comment like that one: a stale
  // comment is indistinguishable from a true one until you check.
  //
  // Keep the key regardless of feature status: this list is also a
  // COMPATIBILITY SURFACE. entitlementsFor() turns it into features{} that
  // clients read, and a browser on an older cached bundle still looks up
  // features.google_review -- dropping the key makes that `undefined` and a
  // paying Pro owner's row renders locked.
  "google_review",
  "google_business",
];

/**
 * The Pro features that have a VISIBLE affordance on a public card, with the
 * copy used when an owner is shown what they are missing.
 *
 * This lives here, not in profile.js or mount.js, because _entitlements.js is
 * the single source of plan truth — adding a Pro feature to the card should
 * mean adding one entry here, not editing a renderer and a bundle in step.
 *
 * DELIBERATELY NARROWER THAN PRO_FEATURES, and each omission is a decision:
 *   google_business — founder decision 2026-08-29: the Business tile is shown
 *                     to Free and Pro alike. Not a Pro feature on the card.
 *   booking         — Free has booking (fixed weekly windows). Not locked.
 *   custom_username — decided at signup, not a card surface.
 *   analytics       — dashboard surface, never rendered on a card.
 */
const CARD_LOCKABLE_FEATURES = [
  {
    key: "native_pay",
    title: "Accept payments on your card",
    detail: "Clients pay your consultation fee by UPI in one tap — native app buttons and a scannable QR.",
  },
  {
    key: "google_review",
    title: "One-tap Google reviews",
    detail:
      "Clients leave you a Google review straight from the card. Link your Google Business listing and Pro turns on the one-tap link; without it they reach your listing and review from there.",
  },
  {
    key: "website",
    title: "Link your website",
    detail: "Add your firm or chamber website as a tile clients can open straight from the card.",
  },
  {
    key: "premium_themes",
    title: "Premium card themes",
    detail: "Midnight and Ivory finishes, beyond the default card.",
  },
  {
    key: "remove_branding",
    title: "Hide the VakilCard badge",
    detail:
      "Every card carries a small tier badge — “VakilCard Free” or “VakilCard Pro ✦”. Pro is the only plan that can switch it off.",
  },
];

/**
 * Which card-visible Pro features this profile does NOT have.
 *
 * Returns [] for Pro. The list is IDENTICAL for every viewer of a given card,
 * which is what keeps the SSR response CDN-cacheable — it describes the CARD's
 * plan, never the viewer. Deciding whether to actually pitch an upgrade is the
 * client's job and depends on whether the OWNER is looking; a visitor must
 * never be shown a pitch aimed at the lawyer.
 */
function lockedCardFeatures(profile) {
  if (isProActive(profile)) return [];
  return CARD_LOCKABLE_FEATURES.map((f) => ({ key: f.key, title: f.title, detail: f.detail }));
}

function isProActive(profile) {
  if (!profile) return false;
  if (profile.subscription_plan !== "PRO") return false;
  if (profile.subscription_status !== "ACTIVE") return false;
  if (profile.subscription_expires_at && new Date(profile.subscription_expires_at) <= new Date())
    return false; // lapsed but not yet swept → behaves FREE immediately
  return true;
}

/**
 * Entitlement summary shipped to the owner's own clients (GET /me).
 * `pricing` is the live catalogue snapshot from _billing.js getPricing();
 * omitted, the cold-start fallback is attached (the shape is identical).
 */
function entitlementsFor(profile, pricing) {
  const pro = isProActive(profile);
  const features = {};
  for (const f of PRO_FEATURES) features[f] = pro;
  const p = pricing || PRICING;
  return {
    plan: pro ? "PRO" : "FREE",
    pro,
    status: profile ? profile.subscription_status || "ACTIVE" : "ACTIVE",
    expires_at: (profile && profile.subscription_expires_at) || null,
    founder_pricing: !!(profile && profile.founder_pricing),
    features,
    pricing: { founder_inr: p.founder_inr, regular_inr: p.regular_inr, period_days: p.period_days },
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

module.exports = {
  PRICING,
  PRO_FEATURES,
  CARD_LOCKABLE_FEATURES,
  lockedCardFeatures,
  isProActive,
  entitlementsFor,
  requirePro,
};
