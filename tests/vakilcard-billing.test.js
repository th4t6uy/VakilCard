// Platform billing client — the pure parts. Prices come from the catalogue,
// the legacy webhook URL forwards only ids, and nothing here holds a gateway
// credential. Run: node tests/vakilcard-billing.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");

const apiDir = path.join(__dirname, "..", "api", "vakilcard");
const billing = require(path.join(apiDir, "_billing.js"));
const { entitlementsFor, PRICING } = require(path.join(apiDir, "_entitlements.js"));

const CATALOGUE = [
  { key: "vakilcard_pro_founder", price_paise: 19900, billing_period: "yearly", active: true },
  { key: "vakilcard_pro", price_paise: 29900, billing_period: "yearly", active: true },
];

test("pricingFromPlans: catalogue rows become the pricing shape the app has always exposed", () => {
  const p = billing.pricingFromPlans(CATALOGUE, {});
  assert.equal(p.founder_inr, 199);
  assert.equal(p.regular_inr, 299);
  assert.equal(p.period_days, 365);
  assert.equal(p.founder_available, true);
  assert.equal(p.founder_plan_key, "vakilcard_pro_founder");
  assert.equal(p.regular_plan_key, "vakilcard_pro");
  assert.equal(p.source, "catalogue");
});

test("pricingFromPlans: the founder WINDOW is the founder row being on sale; env can still close it", () => {
  const closed = billing.pricingFromPlans(
    [CATALOGUE[1], { ...CATALOGUE[0], active: false }],
    {}
  );
  assert.equal(closed.founder_available, false);
  assert.equal(closed.founder_inr, 199, "price still shown while closed (UpgradeSheet greys it out)");
  const envClosed = billing.pricingFromPlans(CATALOGUE, { VAKILCARD_FOUNDER_OPEN: "0" });
  assert.equal(envClosed.founder_available, false);
  // no regular row → nothing to price off → null, caller falls back
  assert.equal(billing.pricingFromPlans([CATALOGUE[0]], {}), null);
  assert.equal(billing.pricingFromPlans(null, {}), null);
});

test("LEGACY_PRICING is a cold-start fallback with the same shape and the same numbers", () => {
  assert.equal(billing.LEGACY_PRICING.founder_inr, PRICING.founder_inr);
  assert.equal(billing.LEGACY_PRICING.regular_inr, PRICING.regular_inr);
  assert.equal(billing.LEGACY_PRICING.period_days, PRICING.period_days);
  assert.equal(billing.LEGACY_PRICING.source, "legacy_fallback");
  const ent = entitlementsFor({ subscription_plan: "FREE", subscription_status: "ACTIVE" }, billing.LEGACY_PRICING);
  assert.deepEqual(ent.pricing, { founder_inr: 199, regular_inr: 299, period_days: 365 });
});

test("entitlementsFor: live catalogue pricing rides through, fallback when omitted", () => {
  const live = billing.pricingFromPlans(
    [{ ...CATALOGUE[0], price_paise: 19900 }, { ...CATALOGUE[1], price_paise: 29900 }],
    {}
  );
  const pro = entitlementsFor(
    { subscription_plan: "PRO", subscription_status: "ACTIVE", subscription_expires_at: new Date(Date.now() + 864e5).toISOString() },
    live
  );
  assert.equal(pro.pricing.regular_inr, 299);
  assert.equal(entitlementsFor(null).pricing.regular_inr, PRICING.regular_inr);
});

test("webhookForwardPayload: only the ids and the event leave this app", () => {
  const charged = {
    event: "subscription.charged",
    payload: {
      subscription: { entity: { id: "sub_ABC123", status: "active", notes: { account_id: "x" } } },
      payment: { entity: { id: "pay_XYZ789", amount: 19900, status: "captured" } },
    },
  };
  assert.deepEqual(billing.webhookForwardPayload(charged), {
    subscriptionId: "sub_ABC123",
    paymentId: "pay_XYZ789",
    event: "subscription.charged",
  });
  const cancelled = { event: "subscription.cancelled", payload: { subscription: { entity: { id: "sub_ABC123" } } } };
  assert.deepEqual(billing.webhookForwardPayload(cancelled), {
    subscriptionId: "sub_ABC123",
    paymentId: null,
    event: "subscription.cancelled",
  });
  // a payment id on a non-charge event is never forwarded as a charge
  const activatedWithPay = { ...cancelled, event: "subscription.activated", payload: { ...charged.payload } };
  assert.equal(billing.webhookForwardPayload(activatedWithPay).paymentId, null);
  // not a subscription event → nothing to forward
  assert.equal(billing.webhookForwardPayload({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } }), null);
  assert.equal(billing.webhookForwardPayload({}), null);
  assert.equal(billing.webhookForwardPayload(null), null);
});

test("webhookForwardEnabled: on by default, only 'off' retires it", () => {
  assert.equal(billing.webhookForwardEnabled({}), true);
  assert.equal(billing.webhookForwardEnabled({ VAKILCARD_WEBHOOK_FORWARD: "1" }), true);
  assert.equal(billing.webhookForwardEnabled({ VAKILCARD_WEBHOOK_FORWARD: "off" }), false);
  assert.equal(billing.webhookForwardEnabled({ VAKILCARD_WEBHOOK_FORWARD: "OFF " }), false);
});

test("paymentsAllowed fails CLOSED; configured() needs the service secret, not a gateway key", () => {
  const saved = { PE: process.env.PAYMENTS_ENABLED, S: process.env.VP_BILLING_SERVICE_SECRET };
  try {
    delete process.env.PAYMENTS_ENABLED;
    assert.equal(billing.paymentsAllowed(), false);
    process.env.PAYMENTS_ENABLED = "True ";
    assert.equal(billing.paymentsAllowed(), true);
    process.env.PAYMENTS_ENABLED = "yes";
    assert.equal(billing.paymentsAllowed(), false);
    delete process.env.VP_BILLING_SERVICE_SECRET;
    assert.equal(billing.configured(), false);
    process.env.VP_BILLING_SERVICE_SECRET = "s";
    assert.equal(billing.configured(), true);
  } finally {
    if (saved.PE === undefined) delete process.env.PAYMENTS_ENABLED; else process.env.PAYMENTS_ENABLED = saved.PE;
    if (saved.S === undefined) delete process.env.VP_BILLING_SERVICE_SECRET; else process.env.VP_BILLING_SERVICE_SECRET = saved.S;
  }
});

test("no gateway credential is read anywhere in the VakilCard server or client source", () => {
  const roots = [apiDir, path.join(__dirname, "..", "src")];
  const offenders = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(js|jsx|cjs|mjs)$/.test(name)) {
        const src = fs.readFileSync(full, "utf8");
        if (/RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|RAZORPAY_KEY_ID|RAZORPAY_OFFER_|rzp_(live|test)_[A-Za-z0-9]{8,}/.test(src)) {
          offenders.push(path.relative(path.join(__dirname, ".."), full));
        }
      }
    }
  };
  for (const r of roots) walk(r);
  assert.deepEqual(offenders, [], "gateway credentials belong to the platform (Apps/Account), never to an app");
  assert.ok(!fs.existsSync(path.join(apiDir, "_razorpay.js")), "_razorpay.js was retired on 2026-09-10");
});
