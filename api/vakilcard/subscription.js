// VakilCard Pro subscription lifecycle — on the PLATFORM payment rail.
//   GET  /api/vakilcard/subscription             → plan, status, pricing, payments_live
//   POST { action: "coupon_preview", code }      → discount preview (authed)
//   POST { action: "checkout", coupon_code? }    → yearly UPI Autopay mandate,
//        created by the platform (account.vakilpedia.com/api/billing/service/
//        mandate) — returns { subscription_id, key_id, … } for the in-app
//        Razorpay Checkout modal. Falls back to the legacy "payments launching"
//        pending response when the platform rail is not configured or the
//        payment gate (PAYMENTS_ENABLED) is closed.
//   POST { action: "verify_payment", … }         → signature-verified activation
//        after the Checkout modal succeeds (authed). The platform verifies the
//        signature, re-fetches the subscription and the payment from the
//        gateway, settles the charge ONCE (keyed on the pay_... id) and grants
//        the entitlement; a database trigger mirrors it onto vakilcard_profiles.
//   POST { action: "cancel" }                    → cancel auto-renewal (authed).
//        Cancels the mandate AT THE GATEWAY through the platform (the previous
//        implementation only flipped the local status and left the bank
//        mandate running), then the trigger mirrors CANCELLED here.
//   POST { action: "activate", secret, … }       → ACTIVATE (admin escape hatch
//        — guarded by VAKILCARD_BILLING_SECRET, never callable from the
//        browser). Provider-agnostic; unchanged.
//   POST with x-razorpay-signature header        → the LEGACY webhook URL.
//        Razorpay's single account-level webhook now points at the platform
//        door (account.vakilpedia.com/api/webhooks/razorpay). Until that is
//        proven, anything still arriving here is FORWARDED to the platform
//        (`sync`): only the subscription/payment ids are passed on, and the
//        platform re-reads the truth from the gateway — nothing in the payload
//        is trusted, which is exactly what this webhook always did. Set
//        VAKILCARD_WEBHOOK_FORWARD=off to retire the forward once nothing
//        arrives here any more. Folded into this function because the
//        deployment is at Vercel's 12-serverless-function ceiling (see
//        booking.js).
//
// Coupons: kind='discount' supracore coupons (e.g. FOUNDER33, 30% off) apply
// to the FIRST YEAR only — the mandate is created at the full plan price and a
// dashboard-created Razorpay Offer (supracore.coupons.provider_offer_id)
// discounts the first cycle. Redemption is recorded by the platform only AFTER
// verified payment, so redemption counts reflect paid conversions.
//
// Pricing: Founder ₹199/yr (locked while the subscription stays active — a
// yearly mandate on the founder plan does that by construction), Regular
// ₹299/yr. Both are rows in supracore.billing_plans; NOTHING in this repo
// hard-codes a price. The founder window is the founder row being on sale
// (active = true); VAKILCARD_FOUNDER_OPEN=0 still closes it for compatibility.
// Coupon checkouts always price off the REGULAR plan — a coupon bypasses the
// founder window.
const { db, resolveAccount } = require("./_lib");
const { entitlementsFor } = require("./_entitlements");
const { audit } = require("./_verify");
const billing = require("./_billing");

const BILLING_SECRET = process.env.VAKILCARD_BILLING_SECRET || "";
const PRODUCT_ID = billing.PRODUCT_ID;

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

const PROFILE_SEL =
  "id,username,full_name,subscription_plan,subscription_status,subscription_expires_at,founder_pricing";

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
async function priceCoupon(code, pricing) {
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

  const base = pricing.regular_inr;
  const value = Number(result.discountValue);
  let final;
  if (result.discountType === "percent") final = round2(base * (1 - value / 100));
  else final = round2(Math.max(0, base - value));
  if (!(final > 0)) return { ok: false, error: "invalid_discount" };
  return { ok: true, coupon: result, base_inr: base, final_inr: final };
}

/* ---- admin activation core (secret path only) ---- */

/**
 * Grant/extend PRO for one period WITHOUT a payment — the admin escape hatch.
 * Renewals extend from the current expiry; fresh activations start from now.
 * Paid activations no longer come through here: the platform settles them and
 * the vakilcard_mirror_entitlement trigger writes these same columns.
 */
async function activatePro({ profile, accountId, founder, priceInr, periodDays, provider, providerRef, meta }) {
  const renewal = profile.subscription_plan === "PRO" && profile.subscription_status === "ACTIVE";
  const base =
    renewal && profile.subscription_expires_at && new Date(profile.subscription_expires_at) > new Date()
      ? new Date(profile.subscription_expires_at)
      : new Date();
  const expires = new Date(base.getTime() + periodDays * 864e5).toISOString();

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

/* ---- legacy webhook URL → platform ---- */

async function handleWebhook(res, body) {
  if (!billing.webhookForwardEnabled()) {
    // Deliberately a non-2xx: if anything still lands here after the forward
    // was retired, Razorpay keeps retrying and the failure is visible in its
    // dashboard instead of a payment vanishing into a 200.
    return json(res, 410, { error: "webhook_moved", to: "account.vakilpedia.com/api/webhooks/razorpay" });
  }
  try {
    const out = await billing.forwardWebhook(body);
    if (!out.forwarded) return json(res, 200, { ok: true, ignored: true, reason: out.reason });
    return json(res, 200, { ok: true, forwarded: true, detail: out.result && out.result.detail });
  } catch (e) {
    console.error("[vakilcard/subscription] webhook forward failed:", e && (e.message || e));
    // 502 so Razorpay retries — the platform is the authority and is idempotent.
    return json(res, 502, { error: "platform_unreachable" });
  }
}

/* ---- handler ---- */

module.exports = async function handler(req, res) {
  try {
    let body = {};
    if (req.method === "POST") {
      if (req.body && typeof req.body === "object") {
        body = req.body;
      } else {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const rawBody = Buffer.concat(chunks).toString("utf8");
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          body = {};
        }
      }
    }

    /* ---- legacy Razorpay webhook URL: forwarded to the platform, NOT session-authed ---- */
    if (req.method === "POST" && req.headers["x-razorpay-signature"]) {
      return handleWebhook(res, body);
    }

    const action = String(body.action || "");
    const pricing = await billing.getPricing();

    /* ---- admin activation: secret-authed, NOT session-authed ---- */
    if (req.method === "POST" && action === "activate") {
      if (!BILLING_SECRET || String(body.secret || "") !== BILLING_SECRET)
        return json(res, 401, { error: "unauthorized" });
      const accountId = String(body.account_id || "");
      if (!accountId) return json(res, 400, { error: "account_id_required" });
      const profile = await ownProfile(accountId);
      if (!profile) return json(res, 404, { error: "no_profile" });

      // Founder price locks for the lifetime of an unbroken subscription.
      const founder = profile.founder_pricing || (pricing.founder_available && body.founder !== false);
      const expires = await activatePro({
        profile,
        accountId,
        founder,
        priceInr: founder ? pricing.founder_inr : pricing.regular_inr,
        periodDays: pricing.period_days,
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
        ...entitlementsFor(profile, pricing),
        founder_available: pricing.founder_available,
        payments_live: billing.configured() && billing.paymentsAllowed(),
      });
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    if (action === "coupon_preview") {
      const priced = await priceCoupon(body.code, pricing);
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
      const couponCode = String(body.coupon_code || "").trim().toUpperCase();

      /* Platform rail not configured, or the payment gate is closed →
         legacy "payments launching" intent. Reuses the existing, already-tested
         path rather than inventing a second dead end. */
      const pending = async () => {
        const founder = pricing.founder_available;
        await logEvent({
          account_id: who.accountId,
          profile_id: profile.id,
          event_type: "CHECKOUT_CREATED",
          plan: "PRO",
          price_inr: founder ? pricing.founder_inr : pricing.regular_inr,
          founder_pricing: founder,
        });
        return json(res, 200, {
          ok: true,
          pending: true,
          price_inr: founder ? pricing.founder_inr : pricing.regular_inr,
          founder_pricing: founder,
          checkout_url: null,
        });
      };
      if (!billing.configured() || !billing.paymentsAllowed()) return pending();

      // A coupon prices off the REGULAR plan (bypasses the founder window);
      // otherwise the founder plan while the window is open.
      const founder = !couponCode && pricing.founder_available;
      const planKey = founder ? pricing.founder_plan_key : pricing.regular_plan_key;

      let out;
      try {
        out = await billing.platformCall("checkout", {
          accountId: who.accountId,
          planKey,
          couponCode: couponCode || null,
          email: null,
          name: profile.full_name || null,
          createdFrom: "vakilcard",
        });
      } catch (e) {
        const code = (e && e.code) || "checkout_failed";
        if (code === "payments_disabled") return pending();
        if (code === "coupon_offer_not_configured") {
          console.error(`[vakilcard/subscription] coupon ${couponCode} valid but provider_offer_id missing`);
          return json(res, 409, { error: "coupon_offer_not_configured" });
        }
        if (code === "mandate_exists") return json(res, 409, { error: "mandate_exists" });
        if (["invalid_code", "expired", "exhausted", "wrong_product", "not_applicable_at_checkout",
             "invalid_discount", "coupon_unavailable"].includes(code) || code.startsWith("coupon_"))
          return json(res, 400, { error: code });
        console.error("[vakilcard/subscription] platform checkout failed:", code, e && e.detail);
        return json(res, 502, { error: "checkout_unavailable" });
      }

      const firstYearInr = out.firstChargePaise / 100;
      const baseInr = out.amountPaise / 100;

      await logEvent({
        account_id: who.accountId,
        profile_id: profile.id,
        event_type: "CHECKOUT_CREATED",
        plan: "PRO",
        price_inr: firstYearInr,
        founder_pricing: founder,
        provider: "razorpay",
        provider_ref: out.subscriptionId,
        meta: { coupon: out.couponApplied || null, plan_inr: baseInr, plan_key: out.planKey, via: "platform" },
      });

      return json(res, 200, {
        ok: true,
        pending: false,
        subscription_id: out.subscriptionId,
        key_id: out.keyId,
        first_charge_inr: firstYearInr,
        renewal_inr: baseInr,
        coupon_applied: out.couponApplied || null,
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

      // Never gated: this completes a payment that has already been made.
      let out;
      try {
        out = await billing.platformCall("verify", {
          accountId: who.accountId,
          paymentId,
          subscriptionId,
          signature,
        });
      } catch (e) {
        const code = (e && e.code) || "verify_failed";
        if (code === "invalid_signature" || code === "missing_payment_fields" || code === "payment_failed")
          return json(res, 400, { error: code });
        if (code === "subscription_account_mismatch") return json(res, 403, { error: code });
        if (code === "provider_unreachable") return json(res, 502, { error: code });
        console.error("[vakilcard/subscription] platform verify failed:", code, e && e.detail);
        return json(res, 502, { error: "verify_unavailable" });
      }

      // The platform settled the charge and the trigger mirrored the profile.
      if (!out.idempotent) {
        await audit("subscription_activated", {
          accountId: who.accountId,
          meta: { profile_id: profile.id, expires: out.periodEnd || null, provider_ref: paymentId, via: "platform" },
        });
      }
      // Spread FIRST — expires_at from this activation must win even if the
      // profile re-read races a replica lag.
      const fresh = await ownProfile(who.accountId);
      return json(res, 200, {
        ...entitlementsFor(fresh, pricing),
        ok: true,
        expires_at: out.periodEnd || (fresh && fresh.subscription_expires_at) || null,
        ...(out.idempotent ? { idempotent: true } : {}),
      });
    }

    if (action === "cancel") {
      if (profile.subscription_plan !== "PRO")
        return json(res, 400, { error: "not_subscribed" });

      // Cancel the mandate AT THE GATEWAY through the platform (never gated).
      // The platform mirrors the gateway's answer onto billing_mandates and the
      // triggers flip this profile to CANCELLED. A Pro with no mandate at all
      // (admin-activated, or pre-platform) is cancelled locally, as before.
      let viaPlatform = false;
      if (billing.configured()) {
        try {
          await billing.platformCall("cancel", { accountId: who.accountId, productId: PRODUCT_ID });
          viaPlatform = true;
        } catch (e) {
          const code = (e && e.code) || "cancel_failed";
          if (code !== "no_mandate") {
            console.error("[vakilcard/subscription] platform cancel failed:", code, e && e.detail);
            return json(res, 502, { error: "cancel_unavailable" });
          }
        }
      }
      if (!viaPlatform) {
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
      }
      await audit("subscription_cancelled", {
        accountId: who.accountId,
        meta: { profile_id: profile.id, via: viaPlatform ? "platform" : "local" },
      });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "unknown_action" });
  } catch (e) {
    console.error("[vakilcard/subscription] server_error:", e && (e.message || e));
    return json(res, 500, { error: "server_error" });
  }
};
