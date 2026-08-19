// Razorpay provider adapter — the ONLY file in this repo that knows Razorpay
// exists. subscription.js talks to it through provider-neutral verbs
// (ensureYearlyPlan, createSubscription, verify*), so swapping/adding a
// gateway later means writing a sibling adapter, not touching billing logic.
//
// Same hand-rolled-fetch rationale as the CaseLinx wrapper (lib/razorpay.ts):
// a handful of endpoints, auditable, no SDK dependency.
//
// UPI Autopay model (founder decision 2026-08-19):
//   * VakilCard Pro is a YEARLY Razorpay Subscription (mandate at the plan
//     price, e.g. ₹299/yr).
//   * A discount coupon (e.g. FOUNDER33, 30% off) applies to the FIRST YEAR
//     ONLY via a Razorpay Offer attached at subscription-create time —
//     renewals recur at the full plan price automatically. Offers are created
//     once in the Razorpay Dashboard; their ids reach this adapter via
//     RAZORPAY_OFFER_<COUPONCODE> env vars (e.g. RAZORPAY_OFFER_FOUNDER33).

const { createHmac, timingSafeEqual } = require("crypto");

const RAZORPAY_API = "https://api.razorpay.com/v1";

function keyId() {
  return process.env.RAZORPAY_KEY_ID || "";
}
function keySecret() {
  return process.env.RAZORPAY_KEY_SECRET || "";
}
function configured() {
  return !!(keyId() && keySecret());
}

function authHeader() {
  if (!configured()) throw new Error("razorpay_not_configured");
  return "Basic " + Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
}

async function rzpFetch(path, init) {
  const r = await fetch(`${RAZORPAY_API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init && init.headers),
    },
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const desc =
      (data && data.error && data.error.description) || `http_${r.status}`;
    const err = new Error(`razorpay_api_error: ${desc}`);
    err.status = r.status;
    err.razorpay = data && data.error;
    throw err;
  }
  return data;
}

/**
 * Find-or-create the yearly plan for a given price. Razorpay plans are
 * immutable and few; listing + matching keeps this idempotent without a
 * local plan-id table or per-price env vars.
 */
async function ensureYearlyPlan(amountPaise, planName) {
  const list = await rzpFetch("/plans?count=100");
  const items = (list && list.items) || [];
  const hit = items.find(
    (p) =>
      p.period === "yearly" &&
      p.interval === 1 &&
      p.item &&
      p.item.amount === amountPaise &&
      p.item.currency === "INR"
  );
  if (hit) return hit;
  return rzpFetch("/plans", {
    method: "POST",
    body: JSON.stringify({
      period: "yearly",
      interval: 1,
      item: { name: planName, amount: amountPaise, currency: "INR" },
    }),
  });
}

// Razorpay requires total_count >= 1 (no "until cancelled" literal). At
// yearly billing, 30 cycles is 30 years — "indefinite" for practical
// purposes; the subscriber can cancel any time.
const INDEFINITE_YEARLY_CYCLE_COUNT = 30;

/**
 * Create a yearly subscription on `planId`. `offerId` (optional) discounts
 * the first cycle — Razorpay's native mechanism for "intro price, renews at
 * full price". `notes` ride on the subscription and come back verbatim in
 * every webhook, which is how the webhook maps a charge to an account
 * without any extra lookup table.
 */
async function createSubscription({ planId, offerId, notes }) {
  const body = {
    plan_id: planId,
    total_count: INDEFINITE_YEARLY_CYCLE_COUNT,
    customer_notify: 1,
    notes: notes || {},
  };
  if (offerId) body.offer_id = offerId;
  return rzpFetch("/subscriptions", { method: "POST", body: JSON.stringify(body) });
}

async function fetchSubscription(subscriptionId) {
  return rzpFetch(`/subscriptions/${subscriptionId}`);
}

async function fetchPayment(paymentId) {
  return rzpFetch(`/payments/${paymentId}`);
}

// Constant-time comparison — a plain === leaks how many leading characters
// of the signature matched.
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Checkout-handler signature for subscriptions:
 * HMAC-SHA256(key_secret) over `${razorpay_payment_id}|${subscription_id}`.
 * (Order differs from one-time Orders — payment id comes FIRST here.)
 */
function verifySubscriptionCheckout({ paymentId, subscriptionId, signature }) {
  if (!paymentId || !subscriptionId || !signature || !configured()) return false;
  const expected = createHmac("sha256", keySecret())
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");
  return timingSafeEqualStr(expected, signature);
}

/**
 * Webhook signature: HMAC-SHA256(webhook_secret) over the RAW request body.
 * The webhook secret is set when creating the webhook in the Razorpay
 * dashboard (RAZORPAY_WEBHOOK_SECRET) — it is NOT the API key secret.
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqualStr(expected, signature);
}

/** Dashboard-created Offer id for a coupon code, if configured. */
function offerIdForCoupon(code) {
  if (!code) return null;
  const key = `RAZORPAY_OFFER_${String(code).toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
  return process.env[key] || null;
}

module.exports = {
  configured,
  keyId,
  ensureYearlyPlan,
  createSubscription,
  fetchSubscription,
  fetchPayment,
  verifySubscriptionCheckout,
  verifyWebhookSignature,
  offerIdForCoupon,
};
