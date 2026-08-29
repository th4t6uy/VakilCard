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

/**
 * PAYMENT GATE — separate from configured() on purpose.
 *
 * The Vakilpedia legal documents state that no payment is accepted and no paid
 * entitlement activated until DatarOne Private Limited is incorporated. This is
 * the switch that makes that true of the software.
 *
 * DEFAULT OFF: enabled only by an explicit PAYMENTS_ENABLED=true, so a missing
 * or misspelt variable fails CLOSED. Same variable name as the Account and
 * CaseLinx, so incorporation day is one setting per project.
 *
 * DO NOT fold this into configured(). configured() also guards
 * verifySubscriptionCheckout() -- gating it there would stop an ALREADY PAID
 * subscription from being verified, i.e. take someone's money and give them
 * nothing. Only charge-CREATING paths consult paymentsAllowed().
 */
function paymentsAllowed() {
  return String(process.env.PAYMENTS_ENABLED || "").trim().toLowerCase() === "true";
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

/* -------------------------------------------------------------------------
 * ONE-OFF PAYMENTS — VakilCard appointment bookings (2026-08-29).
 *
 * Subscriptions above are a MANDATE the advocate signs once. A booking is the
 * opposite shape: a stranger, on someone else's public card, paying a single
 * amount that differs every time. Razorpay models that as a Payment Link.
 *
 * WHY PAYMENT LINKS AND NOT ORDERS + CHECKOUT. The public card is rendered from
 * design_system/vakilcard/ — a verbatim design export that must never be edited
 * (only mount.js is ours). Orders means loading Razorpay's checkout.js into
 * that page and building a modal inside the export's sheet UI. A Payment Link
 * is a URL: mount.js swaps the href it already renders and nothing else moves.
 * The visitor already leaves the page today for their UPI app, so there is no
 * UX regression to trade away. If we ever want the visitor kept on-card, an
 * Orders adapter is a sibling of these three functions — the webhook handler
 * and the schema in booking.js do not change.
 * ---------------------------------------------------------------------------- */

/**
 * Create a Payment Link for a single appointment.
 *
 * `notes` come back VERBATIM in the webhook, which is how the webhook maps a
 * payment to an appointment row with no extra lookup table — the same trick
 * createSubscription() uses. Amount is in PAISE (Razorpay's smallest unit);
 * callers hold rupees, so the conversion happens here, once.
 */
async function createPaymentLink({ amountInr, description, customerName, customerPhone, notes, referenceId, callbackUrl, expireBy }) {
  const body = {
    amount: Math.round(Number(amountInr) * 100),
    currency: "INR",
    accept_partial: false,
    description: String(description || "VakilCard appointment").slice(0, 2048),
    notes: notes || {},
    // Razorpay caps reference_id at 40 characters. An appointment id is a
    // 36-character uuid, so it fits exactly as-is — no encoding, no prefix.
    ...(referenceId ? { reference_id: String(referenceId).slice(0, 40) } : {}),
    ...(callbackUrl ? { callback_url: callbackUrl, callback_method: "get" } : {}),
    ...(expireBy ? { expire_by: expireBy } : {}),
    // Razorpay's own SMS/email nudges are OFF. We already own the client's
    // phone and message them ourselves through MessagingService; a second,
    // differently-worded reminder from an unfamiliar sender is how a first-time
    // client decides the booking was a scam.
    notify: { sms: false, email: false },
    reminder_enable: false,
  };
  if (customerName || customerPhone) {
    body.customer = {
      ...(customerName ? { name: String(customerName).slice(0, 120) } : {}),
      ...(customerPhone ? { contact: String(customerPhone).slice(0, 20) } : {}),
    };
  }
  return rzpFetch("/payment_links", { method: "POST", body: JSON.stringify(body) });
}

/** Authoritative state of a Payment Link. The webhook acts on THIS, never on
 *  the payload it was handed. */
async function fetchPaymentLink(paymentLinkId) {
  return rzpFetch(`/payment_links/${encodeURIComponent(paymentLinkId)}`);
}

/**
 * Booking-webhook signature.
 *
 * Razorpay allows up to 30 webhook URLs per account, each with its OWN secret
 * and its own event selection, so the booking webhook is a second dashboard
 * entry pointing at /api/vakilcard/booking and subscribed to payment_link.*
 * only. RAZORPAY_BOOKING_WEBHOOK_SECRET holds that secret; it falls back to
 * RAZORPAY_WEBHOOK_SECRET so an existing single-secret setup keeps working
 * without a second variable being set first.
 */
function verifyBookingWebhookSignature(rawBody, signature) {
  const secret =
    process.env.RAZORPAY_BOOKING_WEBHOOK_SECRET ||
    process.env.RAZORPAY_WEBHOOK_SECRET ||
    "";
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
  paymentsAllowed,
  keyId,
  ensureYearlyPlan,
  createSubscription,
  fetchSubscription,
  fetchPayment,
  verifySubscriptionCheckout,
  verifyWebhookSignature,
  offerIdForCoupon,
  // one-off payments (appointment bookings)
  createPaymentLink,
  fetchPaymentLink,
  verifyBookingWebhookSignature,
};
