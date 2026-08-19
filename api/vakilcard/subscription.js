// VakilCard Pro subscription lifecycle.
//   GET  /api/vakilcard/subscription             → plan, status, pricing, payments_live
//   POST { action: "coupon_preview", code }      → discount preview (authed)
//   POST { action: "checkout", coupon_code? }    → Razorpay yearly subscription
//        (UPI Autopay mandate) — returns { subscription_id, key_id, … } for the
//        in-app Razorpay Checkout modal. Falls back to the legacy "payments
//        launching" pending response when Razorpay is not configured.
//   POST { action: "verify_payment", … }         → signature-verified activation
//        after the Checkout modal succeeds (authed).
//   POST { action: "cancel" }                    → cancel auto-renewal (authed)
//   POST { action: "activate", secret, … }       → ACTIVATE (billing webhook
//        / admin only — guarded by VAKILCARD_BILLING_SECRET, never callable
//        from the browser). Provider-agnostic escape hatch.
//   POST with x-razorpay-signature header        → Razorpay WEBHOOK (renewals,
//        cancellations). Folded into this function because the deployment is
//        at Vercel's 12-serverless-function ceiling (see booking.js). The
//        webhook never trusts its payload: it re-fetches the subscription
//        from Razorpay's API by id before acting.
//
// Coupons: kind='discount' supracore coupons (e.g. FOUNDER33, 30% off) apply
// to the FIRST YEAR only — the Razorpay mandate is created at the full plan
// price and a dashboard-created Razorpay Offer (RAZORPAY_OFFER_<CODE> env)
// discounts the first cycle. supracore_coupon_redeem is called only AFTER
// verified payment, so redemption counts reflect paid conversions.
//
// Pricing: Founder ₹199/yr (locked while the subscription stays active),
// Regular ₹299/yr. Founder window is controlled by VAKILCARD_FOUNDER_OPEN
// ("0" closes it; open by default during beta). Coupon checkouts always
// price off the REGULAR rate — a coupon bypasses the founder window.
const { db, resolveAccount } = require("./_lib");
const { PRICING, entitlementsFor } = require("./_entitlements");
const { audit } = require("./_verify");
const rzp = require("./_razorpay");

const BILLING_SECRET = process.env.VAKILCARD_BILLING_SECRET || "";
const FOUNDER_OPEN = process.env.VAKILCARD_FOUNDER_OPEN !== "0";
const PRODUCT_ID = "vakilcard";

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

const PROFILE_SEL =
  "id,username,subscription_plan,subscription_status,subscription_expires_at,founder_pricing";

async function ownProfile(accountId) {
  const rows = await db(`vakilcard_profiles?account_id=eq.${accountId}&select=${PROFILE_SEL}`);
  return rows[0] || null;
}

async function logEvent(body) {
  await db("vakilcard_subscription_events", {
    method: "POST",
    body,
    prefer: "return=minimal",
  });
}

/* ---- coupon pricing (provider-agnostic) ---- */

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Validate a coupon for VakilCard checkout via the shared supracore pipeline.
 * Returns { ok:true, coupon, base_inr, final_inr } or { ok:false, error }.
 * Only kind='discount' coupons apply at checkout — grant coupons have their
 * own redemption paths (see auth.js redeem_courtque_beta for the pattern).
 */
async function priceCoupon(code) {
  let result;
  try {
    const rpc = await db("rpc/supracore_coupon_preview", {
      method: "POST",
      body: { p_code: String(code || "") },
    });
    result = Array.isArray(rpc) ? rpc[0] : rpc;
  } catch (e) {
    console.error("[vakilcard/subscription] coupon preview RPC failed:", e && (e.message || e));
    return { ok: false, error: "coupon_unavailable" };
  }
  if (!result || result.ok !== true) {
    return { ok: false, error: (result && result.error) || "invalid_code" };
  }
  if (result.productId !== PRODUCT_ID) return { ok: false, error: "wrong_product" };
  if (result.kind !== "discount") return { ok: false, error: "not_applicable_at_checkout" };

  const base = PRICING.regular_inr;
  const value = Number(result.discountValue);
  let final;
  if (result.discountType === "percent") final = round2(base * (1 - value / 100));
  else final = round2(Math.max(0, base - value));
  if (!(final > 0)) return { ok: false, error: "invalid_discount" };
  return { ok: true, coupon: result, base_inr: base, final_inr: final };
}

/* ---- activation core (shared by verify_payment, webhook, secret path) ---- */

/**
 * Idempotency guard: has this provider payment already activated/renewed?
 * Protects against the verify_payment ⇄ webhook race double-extending expiry.
 */
async function alreadyProcessed(providerRef) {
  if (!providerRef) return false;
  const rows = await db(
    `vakilcard_subscription_events?provider=eq.razorpay&provider_ref=eq.${encodeURIComponent(
      providerRef
    )}&event_type=in.(ACTIVATED,RENEWED)&select=id&limit=1`
  );
  return rows.length > 0;
}

/**
 * Grant/extend PRO for one period. Renewals extend from the current expiry;
 * fresh activations start from now. Returns the new expiry ISO string.
 */
async function activatePro({ profile, accountId, founder, priceInr, provider, providerRef, meta }) {
  const renewal = profile.subscription_plan === "PRO" && profile.subscription_status === "ACTIVE";
  const base =
    renewal && profile.subscription_expires_at && new Date(profile.subscription_expires_at) > new Date()
      ? new Date(profile.subscription_expires_at)
      : new Date();
  const expires = new Date(base.getTime() + PRICING.period_days * 864e5).toISOString();

  await db(`vakilcard_profiles?id=eq.${profile.id}`, {
    method: "PATCH",
    body: {
      subscription_plan: "PRO",
      subscription_status: "ACTIVE",
      subscription_expires_at: expires,
      founder_pricing: !!founder,
    },
    prefer: "return=minimal",
  });
  await logEvent({
    account_id: accountId,
    profile_id: profile.id,
    event_type: renewal ? "RENEWED" : "ACTIVATED",
    plan: "PRO",
    price_inr: priceInr,
    founder_pricing: !!founder,
    provider: provider || null,
    provider_ref: providerRef || null,
    ...(meta ? { meta } : {}),
  });
  await audit("subscription_activated", {
    accountId,
    meta: { profile_id: profile.id, founder: !!founder, expires, provider_ref: providerRef || null },
  });
  return expires;
}

/** Best-effort supracore redemption record — never blocks an activation. */
async function recordCouponRedemption(accountId, code) {
  try {
    await db("rpc/supracore_coupon_redeem", {
      method: "POST",
      body: { p_account_id: accountId, p_code: String(code), p_actor_id: accountId },
    });
  } catch (e) {
    console.error("[vakilcard/subscription] coupon redeem record failed:", e && (e.message || e));
  }
}

/* ---- Razorpay webhook (renewals / cancellations) ---- */

async function handleWebhook(req, res, body, rawBody) {
  const signature = req.headers["x-razorpay-signature"];
  // Signature over the raw body when we have it. When the platform has
  // already consumed/parsed the stream the raw bytes are gone — the payload
  // is then treated as UNTRUSTED either way: we only ever act on state
  // re-fetched from Razorpay's API by id.
  const signatureOk = rawBody ? rzp.verifyWebhookSignature(rawBody, signature) : false;

  const event = body && body.event;
  const subEntity =
    body && body.payload && body.payload.subscription && body.payload.subscription.entity;
  const payEntity = body && body.payload && body.payload.payment && body.payload.payment.entity;
  const subId = subEntity && subEntity.id;
  if (!event || !subId) return json(res, 200, { ok: true, ignored: true });

  // Authoritative state — never the webhook payload.
  let sub;
  try {
    sub = await rzp.fetchSubscription(subId);
  } catch (e) {
    console.error("[vakilcard/subscription] webhook subscription fetch failed:", e && e.message);
    return json(res, 502, { error: "provider_unreachable" });
  }
  const notes = (sub && sub.notes) || {};
  const accountId = notes.account_id;
  if (!accountId || notes.product !== PRODUCT_ID)
    return json(res, 200, { ok: true, ignored: true, reason: "not_vakilcard" });
  const profile = await ownProfile(accountId);
  if (!profile) return json(res, 200, { ok: true, ignored: true, reason: "no_profile" });

  if (event === "subscription.charged" && ["active", "completed"].includes(sub.status)) {
    const paymentId = payEntity && payEntity.id;
    if (await alreadyProcessed(paymentId)) {
      return json(res, 200, { ok: true, idempotent: true });
    }
    let amountInr = null;
    if (paymentId) {
      try {
        const payment = await rzp.fetchPayment(paymentId);
        amountInr = payment && payment.amount != null ? payment.amount / 100 : null;
      } catch {
        /* amount is informational; activation proceeds */
      }
    }
    const expires = await activatePro({
      profile,
      accountId,
      founder: notes.founder === "1",
      priceInr: amountInr != null ? amountInr : PRICING.regular_inr,
      provider: "razorpay",
      providerRef: paymentId || subId,
      meta: {
        via: "webhook",
        event,
        subscription_id: subId,
        coupon: notes.coupon || null,
        signature_verified: signatureOk,
      },
    });
    // First charge may land via webhook before the browser's verify_payment —
    // record the coupon redemption here too (redeem is idempotent per account).
    if (notes.coupon) await recordCouponRedemption(accountId, notes.coupon);
    return json(res, 200, { ok: true, expires_at: expires });
  }

  if (event === "subscription.cancelled" || event === "subscription.halted") {
    if (profile.subscription_plan === "PRO" && profile.subscription_status === "ACTIVE") {
      await db(`vakilcard_profiles?id=eq.${profile.id}`, {
        method: "PATCH",
        body: { subscription_status: "CANCELLED" },
        prefer: "return=minimal",
      });
      await logEvent({
        account_id: accountId,
        profile_id: profile.id,
        event_type: "CANCELLED",
        plan: "PRO",
        founder_pricing: !!profile.founder_pricing,
        provider: "razorpay",
        provider_ref: subId,
      });
    }
    return json(res, 200, { ok: true });
  }

  return json(res, 200, { ok: true, ignored: true, event });
}

/* ---- handler ---- */

module.exports = async function handler(req, res) {
  try {
    let body = {};
    let rawBody = null;
    if (req.method === "POST") {
      if (req.body && typeof req.body === "object") {
        body = req.body; // platform pre-parsed the stream; raw bytes unavailable
      } else {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        rawBody = Buffer.concat(chunks).toString("utf8");
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          body = {};
        }
      }
    }

    /* ---- Razorpay webhook: provider-authed via signature, NOT session-authed ---- */
    if (req.method === "POST" && req.headers["x-razorpay-signature"]) {
      return handleWebhook(req, res, body, rawBody);
    }

    const action = String(body.action || "");

    /* ---- billing webhook / admin activation: secret-authed, NOT session-authed ---- */
    if (req.method === "POST" && action === "activate") {
      if (!BILLING_SECRET || String(body.secret || "") !== BILLING_SECRET)
        return json(res, 401, { error: "unauthorized" });
      const accountId = String(body.account_id || "");
      if (!accountId) return json(res, 400, { error: "account_id_required" });
      const profile = await ownProfile(accountId);
      if (!profile) return json(res, 404, { error: "no_profile" });

      // Founder price locks for the lifetime of an unbroken subscription.
      const founder = profile.founder_pricing || (FOUNDER_OPEN && body.founder !== false);
      const expires = await activatePro({
        profile,
        accountId,
        founder,
        priceInr: founder ? PRICING.founder_inr : PRICING.regular_inr,
        provider: body.provider || null,
        providerRef: body.provider_ref || null,
      });
      return json(res, 200, { ok: true, expires_at: expires, founder_pricing: founder });
    }

    /* ---- session-authed surface ---- */
    const who = await resolveAccount(req);
    if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
    const profile = await ownProfile(who.accountId);
    if (!profile) return json(res, 404, { error: "no_profile" });

    if (req.method === "GET") {
      return json(res, 200, {
        ...entitlementsFor(profile),
        founder_available: FOUNDER_OPEN,
        payments_live: rzp.configured(),
      });
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    if (action === "coupon_preview") {
      const priced = await priceCoupon(body.code);
      if (!priced.ok) return json(res, 200, { ok: false, error: priced.error });
      return json(res, 200, {
        ok: true,
        code: priced.coupon.code,
        description: priced.coupon.description || null,
        discount_type: priced.coupon.discountType,
        discount_value: Number(priced.coupon.discountValue),
        base_inr: priced.base_inr,
        final_inr: priced.final_inr,
        first_year_only: true,
        valid_until: priced.coupon.validUntil || null,
      });
    }

    if (action === "checkout") {
      const couponCode = String(body.coupon_code || "").trim();

      /* Razorpay not configured → legacy "payments launching" intent. */
      if (!rzp.configured()) {
        const founder = FOUNDER_OPEN;
        await logEvent({
          account_id: who.accountId,
          profile_id: profile.id,
          event_type: "CHECKOUT_CREATED",
          plan: "PRO",
          price_inr: founder ? PRICING.founder_inr : PRICING.regular_inr,
          founder_pricing: founder,
        });
        return json(res, 200, {
          ok: true,
          pending: true,
          price_inr: founder ? PRICING.founder_inr : PRICING.regular_inr,
          founder_pricing: founder,
          checkout_url: null, // provider integration pending
        });
      }

      let baseInr;
      let firstYearInr;
      let founder = false;
      let offerId = null;

      if (couponCode) {
        const priced = await priceCoupon(couponCode);
        if (!priced.ok) return json(res, 400, { error: priced.error });
        offerId = rzp.offerIdForCoupon(priced.coupon.code);
        if (!offerId) {
          // The dashboard Offer that funds the first-cycle discount is not
          // configured — surface a precise error instead of silently charging
          // full price against an advertised discount.
          console.error(
            `[vakilcard/subscription] coupon ${priced.coupon.code} valid but RAZORPAY_OFFER_* env missing`
          );
          return json(res, 409, { error: "coupon_offer_not_configured" });
        }
        baseInr = priced.base_inr; // mandate + renewals at the regular price
        firstYearInr = priced.final_inr;
      } else {
        founder = FOUNDER_OPEN;
        baseInr = founder ? PRICING.founder_inr : PRICING.regular_inr;
        firstYearInr = baseInr;
      }

      const planAmountPaise = Math.round(baseInr * 100);
      const plan = await rzp.ensureYearlyPlan(planAmountPaise, "VakilCard Pro (Yearly)");
      const sub = await rzp.createSubscription({
        planId: plan.id,
        offerId,
        notes: {
          product: PRODUCT_ID,
          account_id: who.accountId,
          profile_id: profile.id,
          coupon: couponCode ? couponCode.toUpperCase() : "",
          founder: founder ? "1" : "0",
        },
      });

      await logEvent({
        account_id: who.accountId,
        profile_id: profile.id,
        event_type: "CHECKOUT_CREATED",
        plan: "PRO",
        price_inr: firstYearInr,
        founder_pricing: founder,
        provider: "razorpay",
        provider_ref: sub.id,
        meta: { coupon: couponCode ? couponCode.toUpperCase() : null, plan_inr: baseInr },
      });

      return json(res, 200, {
        ok: true,
        pending: false,
        subscription_id: sub.id,
        key_id: rzp.keyId(),
        first_charge_inr: firstYearInr,
        renewal_inr: baseInr,
        coupon_applied: couponCode ? couponCode.toUpperCase() : null,
        founder_pricing: founder,
        currency: "INR",
      });
    }

    if (action === "verify_payment") {
      const paymentId = String(body.razorpay_payment_id || "");
      const subscriptionId = String(body.razorpay_subscription_id || "");
      const signature = String(body.razorpay_signature || "");
      if (!paymentId || !subscriptionId || !signature)
        return json(res, 400, { error: "missing_payment_fields" });
      if (!rzp.verifySubscriptionCheckout({ paymentId, subscriptionId, signature }))
        return json(res, 400, { error: "invalid_signature" });

      // Bind the subscription to THIS account — a leaked signature from some
      // other user's browser must not activate anyone else.
      let sub;
      try {
        sub = await rzp.fetchSubscription(subscriptionId);
      } catch (e) {
        console.error("[vakilcard/subscription] verify fetch failed:", e && e.message);
        return json(res, 502, { error: "provider_unreachable" });
      }
      const notes = (sub && sub.notes) || {};
      if (notes.account_id !== who.accountId)
        return json(res, 403, { error: "subscription_account_mismatch" });

      if (await alreadyProcessed(paymentId)) {
        const fresh = await ownProfile(who.accountId);
        return json(res, 200, { ...entitlementsFor(fresh), ok: true, idempotent: true });
      }

      let amountInr = null;
      try {
        const payment = await rzp.fetchPayment(paymentId);
        if (payment && payment.status === "failed")
          return json(res, 400, { error: "payment_failed" });
        amountInr = payment && payment.amount != null ? payment.amount / 100 : null;
      } catch {
        /* amount informational; signature already proves the charge */
      }

      const expires = await activatePro({
        profile,
        accountId: who.accountId,
        founder: notes.founder === "1",
        priceInr: amountInr != null ? amountInr : PRICING.regular_inr,
        provider: "razorpay",
        providerRef: paymentId,
        meta: { via: "checkout", subscription_id: subscriptionId, coupon: notes.coupon || null },
      });
      if (notes.coupon) await recordCouponRedemption(who.accountId, notes.coupon);

      // Spread FIRST — expires_at from this activation must win even if the
      // profile re-read races a replica lag.
      const fresh = await ownProfile(who.accountId);
      return json(res, 200, { ...entitlementsFor(fresh), ok: true, expires_at: expires });
    }

    if (action === "cancel") {
      if (profile.subscription_plan !== "PRO")
        return json(res, 400, { error: "not_subscribed" });
      await db(`vakilcard_profiles?id=eq.${profile.id}`, {
        method: "PATCH",
        body: { subscription_status: "CANCELLED" },
        prefer: "return=minimal",
      });
      await logEvent({
        account_id: who.accountId,
        profile_id: profile.id,
        event_type: "CANCELLED",
        plan: "PRO",
        founder_pricing: !!profile.founder_pricing,
      });
      await audit("subscription_cancelled", { accountId: who.accountId, meta: { profile_id: profile.id } });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "unknown_action" });
  } catch (e) {
    console.error("[vakilcard/subscription] server_error:", e && (e.message || e));
    return json(res, 500, { error: "server_error" });
  }
};
