// VakilCard Pro subscription lifecycle.
//   GET  /api/vakilcard/subscription             → plan, status, pricing
//   POST { action: "checkout", plan: "PRO" }     → checkout intent (authed)
//   POST { action: "cancel" }                    → cancel auto-renewal (authed)
//   POST { action: "activate", secret, … }       → ACTIVATE (billing webhook
//        / admin only — guarded by VAKILCARD_BILLING_SECRET, never callable
//        from the browser). Provider-agnostic: Razorpay/other webhooks call
//        this after verified payment.
//
// Pricing: Founder ₹199/yr (locked while the subscription stays active),
// Regular ₹299/yr. Founder window is controlled by VAKILCARD_FOUNDER_OPEN
// ("0" closes it; open by default during beta).
const { db, readJsonBody, resolveAccount } = require("./_lib");
const { PRICING, entitlementsFor } = require("./_entitlements");
const { audit } = require("./_verify");

const BILLING_SECRET = process.env.VAKILCARD_BILLING_SECRET || "";
const FOUNDER_OPEN = process.env.VAKILCARD_FOUNDER_OPEN !== "0";

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

module.exports = async function handler(req, res) {
  try {
    const body = req.method === "POST" ? await readJsonBody(req) : {};
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
          founder_pricing: founder,
        },
        prefer: "return=minimal",
      });
      await logEvent({
        account_id: accountId,
        profile_id: profile.id,
        event_type: renewal ? "RENEWED" : "ACTIVATED",
        plan: "PRO",
        price_inr: founder ? PRICING.founder_inr : PRICING.regular_inr,
        founder_pricing: founder,
        provider: body.provider || null,
        provider_ref: body.provider_ref || null,
      });
      await audit("subscription_activated", {
        accountId,
        meta: { profile_id: profile.id, founder, expires, provider_ref: body.provider_ref || null },
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
      });
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    if (action === "checkout") {
      // Provider hook point: once a payment gateway is wired, this creates
      // the provider order and returns its hosted-checkout URL. Until then
      // the intent is recorded and the client shows "payments launching".
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
    return json(res, 500, { error: "server_error" });
  }
};
