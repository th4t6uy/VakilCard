// Platform billing client — the ONLY file in VakilCard that knows where the
// money rail lives. VakilCard holds no payment-gateway credential and computes
// no price: prices come from the platform catalogue (supracore.billing_plans),
// mandates are created, verified and cancelled by the platform
// (account.vakilpedia.com/api/billing/service/mandate), and the platform's
// webhook door records every charge. This file replaced _razorpay.js on
// 2026-09-10 (founder rule: no app implements its own payment mechanism).
//
// What did NOT change, on purpose — VakilCard's behaviour was the reference
// the platform rail was generalised from:
//   * checkout is a YEARLY UPI AutoPay mandate at the plan price (₹199
//     founder / ₹299 regular), opened in the in-app Razorpay Checkout modal
//     restricted to UPI (UpgradeSheet.js, unchanged);
//   * a discount coupon (e.g. FOUNDER33) discounts the FIRST YEAR only via a
//     dashboard-created Offer; renewals recur at full price. The Offer id now
//     lives in supracore.coupons.provider_offer_id instead of a per-coupon
//     env var on this project;
//   * nothing ever trusts a webhook payload — the platform re-fetches the
//     subscription AND the payment from the gateway before acting;
//   * renewals extend from the current expiry, never from "now";
//   * the same payment id can never activate twice.
//
// Env (Vercel project "vakilcard"):
//   ACCOUNT_ORIGIN             https://account.vakilpedia.com (default)
//   VP_BILLING_SERVICE_SECRET  shared with the Account app; header
//                              x-vp-service-secret. Unset ⇒ the platform rail
//                              is "not configured" and checkout falls back to
//                              the "payments launching" pending response.
//   PAYMENTS_ENABLED           payment gate, fails CLOSED (same name and
//                              semantics as the Account app; both must be true).
//   VAKILCARD_WEBHOOK_FORWARD  "off" stops the legacy webhook URL forwarding to
//                              the platform (only once Razorpay points at the
//                              platform door and that is proven). Default: on.
const { db } = require("./_lib");
const { PRICING: FALLBACK_PRICING } = require("./_entitlements");

const ACCOUNT_ORIGIN = process.env.ACCOUNT_ORIGIN || "https://account.vakilpedia.com";
const PRODUCT_ID = "vakilcard";
const PLAN_KEYS = Object.freeze({ founder: "vakilcard_pro_founder", regular: "vakilcard_pro" });

function serviceSecret() {
  return process.env.VP_BILLING_SERVICE_SECRET || "";
}

/** The platform rail is reachable: we hold the service secret. */
function configured() {
  return !!serviceSecret();
}

/**
 * PAYMENT GATE — separate from configured() on purpose.
 *
 * Payments stay OFF until DatarOne Private Limited (incorporated, CIN
 * U62099MP2026PTC086878) has its own bank account and a Razorpay account in the
 * company's name -- an operational condition, no longer a contract term (see
 * the Account's lib/billing/gate.ts). DEFAULT OFF: enabled only
 * by an explicit PAYMENTS_ENABLED=true, so a missing or misspelt variable fails
 * CLOSED. The platform applies the same gate on its side; both must agree.
 *
 * Only charge-CREATING paths consult this. Verifying an ALREADY PAID
 * subscription, cancelling, and the webhook forward are never gated — gating
 * them would take someone's money and give them nothing.
 */
function paymentsAllowed() {
  return String(process.env.PAYMENTS_ENABLED || "").trim().toLowerCase() === "true";
}

/**
 * One call to the platform mandate rail. Resolves with the JSON body on 2xx;
 * throws an Error carrying `.code` (the platform's error/code) and `.status`
 * otherwise, so callers can map precise conditions (coupon_offer_not_configured,
 * mandate_exists, payments_disabled …) to the responses the UI already knows.
 */
async function platformCall(action, payload) {
  if (!configured()) {
    const err = new Error("platform_billing_not_configured");
    err.code = "platform_billing_not_configured";
    err.status = 503;
    throw err;
  }
  const r = await fetch(`${ACCOUNT_ORIGIN}/api/billing/service/mandate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vp-service-secret": serviceSecret(),
    },
    body: JSON.stringify({ action, ...(payload || {}) }),
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!r.ok || !data || data.ok === false) {
    const code = (data && (data.code || data.error)) || `platform_${r.status}`;
    const err = new Error(String(code));
    err.code = String(code);
    err.status = r.status;
    err.detail = data && data.error;
    throw err;
  }
  return data;
}

/* ---------------- pricing, from the platform catalogue ---------------- */

/**
 * COLD-START FALLBACK ONLY (see the note on PRICING in _entitlements.js). Not
 * the prices — the catalogue is. Changing a number here changes nothing that
 * is charged; change supracore.billing_plans.
 */
const LEGACY_PRICING = Object.freeze({
  ...FALLBACK_PRICING,
  founder_available: true,
  founder_plan_key: PLAN_KEYS.founder,
  regular_plan_key: PLAN_KEYS.regular,
  source: "legacy_fallback",
});

function periodDays(billingPeriod) {
  if (billingPeriod === "yearly") return 365;
  if (billingPeriod === "daily") return 1;
  return 30;
}

/**
 * Fold catalogue rows for product 'vakilcard' into the pricing shape the app
 * has always exposed (entitlements.pricing / UpgradeSheet). Pure — unit-tested.
 * The founder WINDOW is the founder row being on sale (active = true); an
 * env VAKILCARD_FOUNDER_OPEN=0 still closes it, for backwards compatibility.
 */
function pricingFromPlans(rows, env) {
  const e = env || process.env;
  const list = Array.isArray(rows) ? rows : [];
  const founder = list.find((p) => p.key === PLAN_KEYS.founder) || null;
  const regular = list.find((p) => p.key === PLAN_KEYS.regular) || null;
  if (!regular) return null;
  const envFounderOpen = e.VAKILCARD_FOUNDER_OPEN !== "0";
  return {
    founder_inr: founder ? founder.price_paise / 100 : LEGACY_PRICING.founder_inr,
    regular_inr: regular.price_paise / 100,
    period_days: periodDays(regular.billing_period),
    founder_available: !!(founder && founder.active !== false && envFounderOpen),
    founder_plan_key: PLAN_KEYS.founder,
    regular_plan_key: PLAN_KEYS.regular,
    source: "catalogue",
  };
}

const PRICING_TTL_MS = 5 * 60 * 1000;
let pricingCache = { at: 0, value: null };
let pricingInflight = null;

/**
 * Current VakilCard pricing from supracore.billing_plans (via the public
 * pricing_plans view). 5-minute in-memory cache; concurrent misses collapse
 * into one read; degrades fresh → last-known-good → LEGACY_PRICING. Does NOT
 * fail closed: refusing to render a price over a catalogue blip helps nobody,
 * and nothing here CHARGES — the platform prices the mandate from the same
 * table when checkout actually happens.
 */
async function getPricing() {
  const now = Date.now();
  if (pricingCache.value && now - pricingCache.at < PRICING_TTL_MS) return pricingCache.value;
  if (pricingInflight) return pricingInflight;
  pricingInflight = (async () => {
    try {
      const rows = await db(
        `pricing_plans?product_id=eq.${PRODUCT_ID}&select=key,price_paise,billing_period,active`
      );
      const priced = pricingFromPlans(rows);
      if (priced) {
        pricingCache = { at: Date.now(), value: priced };
        return priced;
      }
      console.error("[vakilcard/billing] catalogue has no vakilcard_pro row — using last-known-good");
    } catch (e) {
      console.error("[vakilcard/billing] pricing read failed:", e && (e.message || e));
    }
    return pricingCache.value || LEGACY_PRICING;
  })().finally(() => {
    pricingInflight = null;
  });
  return pricingInflight;
}

/* ---------------- legacy webhook URL → platform ---------------- */

function webhookForwardEnabled(env) {
  return String((env || process.env).VAKILCARD_WEBHOOK_FORWARD || "").trim().toLowerCase() !== "off";
}

/**
 * What the legacy webhook URL needs from a Razorpay event to hand it to the
 * platform: the subscription id, the payment id (charges only) and the event
 * name. Nothing else in the payload is used — the platform re-reads the truth
 * from the gateway by id, which is exactly what VakilCard's own webhook did.
 * Pure — unit-tested.
 */
function webhookForwardPayload(body) {
  const event = body && body.event ? String(body.event) : "";
  const sub = body && body.payload && body.payload.subscription && body.payload.subscription.entity;
  const pay = body && body.payload && body.payload.payment && body.payload.payment.entity;
  const subscriptionId = sub && sub.id ? String(sub.id) : "";
  if (!event.startsWith("subscription.") || !subscriptionId) return null;
  return {
    subscriptionId,
    paymentId: event === "subscription.charged" && pay && pay.id ? String(pay.id) : null,
    event,
  };
}

async function forwardWebhook(body) {
  const payload = webhookForwardPayload(body);
  if (!payload) return { forwarded: false, reason: "not_a_subscription_event" };
  const data = await platformCall("sync", payload);
  return { forwarded: true, result: data };
}

module.exports = {
  PRODUCT_ID,
  PLAN_KEYS,
  LEGACY_PRICING,
  configured,
  paymentsAllowed,
  platformCall,
  pricingFromPlans,
  getPricing,
  webhookForwardEnabled,
  webhookForwardPayload,
  forwardWebhook,
};
