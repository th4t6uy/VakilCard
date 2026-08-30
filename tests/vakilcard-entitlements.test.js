// Free vs Pro: entitlement math + username generation.
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const { isProActive, entitlementsFor, PRO_FEATURES, CARD_LOCKABLE_FEATURES, lockedCardFeatures } = require(
  path.join(__dirname, "..", "api", "vakilcard", "_entitlements.js")
);
const { autoUsernameBase, generateAutoUsername } = require(
  path.join(__dirname, "..", "api", "vakilcard", "_usernames.js")
);

const future = new Date(Date.now() + 30 * 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();

test("isProActive: only PRO + ACTIVE + unexpired is entitled", () => {
  assert.ok(isProActive({ subscription_plan: "PRO", subscription_status: "ACTIVE", subscription_expires_at: future }));
  assert.ok(isProActive({ subscription_plan: "PRO", subscription_status: "ACTIVE", subscription_expires_at: null }));
  // every non-entitled shape behaves FREE
  assert.ok(!isProActive(null));
  assert.ok(!isProActive({ subscription_plan: "FREE", subscription_status: "ACTIVE" }));
  assert.ok(!isProActive({ subscription_plan: "PRO", subscription_status: "EXPIRED", subscription_expires_at: future }));
  assert.ok(!isProActive({ subscription_plan: "PRO", subscription_status: "CANCELLED", subscription_expires_at: future }));
  assert.ok(!isProActive({ subscription_plan: "PRO", subscription_status: "ACTIVE", subscription_expires_at: past }));
});

test("entitlementsFor: every Pro feature flips together, pricing attached", () => {
  // The catalogue itself: existing keys must never silently disappear
  // (preserves current users' plans), and google_business is Pro-gated.
  for (const k of [
    "custom_username", "native_pay", "website", "booking", "analytics",
    "premium_themes", "remove_branding", "google_review", "google_business",
  ]) assert.ok(PRO_FEATURES.includes(k), `PRO_FEATURES must include ${k}`);
  const free = entitlementsFor({ subscription_plan: "FREE", subscription_status: "ACTIVE" });
  assert.equal(free.plan, "FREE");
  for (const f of PRO_FEATURES) assert.equal(free.features[f], false);
  const pro = entitlementsFor({ subscription_plan: "PRO", subscription_status: "ACTIVE", subscription_expires_at: future, founder_pricing: true });
  assert.equal(pro.plan, "PRO");
  assert.equal(pro.founder_pricing, true);
  for (const f of PRO_FEATURES) assert.equal(pro.features[f], true);
  assert.equal(pro.pricing.founder_inr, 199);
  assert.equal(pro.pricing.regular_inr, 299);
});

test("autoUsernameBase: [first initial][last initial][last five digits]", () => {
  assert.equal(autoUsernameBase("Jasween Gujral", "+919425388999"), "jg88999");
  assert.equal(autoUsernameBase("Priya Mehta", "+911111182716"), "pm82716");
  assert.equal(autoUsernameBase("Adv. Sidharth Kumar Gautam", "+919425388999"), "sg88999");
  assert.equal(autoUsernameBase("Priya", "9876543210"), "pr43210"); // single word
  assert.equal(autoUsernameBase("", "9876543210"), "vc43210"); // nameless fallback
});

test("generateAutoUsername: collision appends random digits, stays unique", async () => {
  const taken = new Set(["jg88999"]);
  const u = await generateAutoUsername("Jasween Gujral", "+919425388999", async (c) => taken.has(c));
  assert.notEqual(u, "jg88999");
  assert.match(u, /^jg88999\d{3}$/);
  // no collision → deterministic base
  const clean = await generateAutoUsername("Jasween Gujral", "+919425388999", async () => false);
  assert.equal(clean, "jg88999");
});

test("lockedCardFeatures: Pro locks nothing, Free locks only REAL card-visible features", () => {
  const pro = { subscription_plan: "PRO", subscription_status: "ACTIVE", subscription_expires_at: future };
  const free = { subscription_plan: "FREE", subscription_status: "ACTIVE" };

  assert.deepEqual(lockedCardFeatures(pro), [], "a Pro card must have nothing to upsell");
  assert.deepEqual(lockedCardFeatures(null), lockedCardFeatures(free), "no profile behaves FREE");

  const keys = lockedCardFeatures(free).map((f) => f.key);
  assert.ok(keys.length > 0);
  for (const f of lockedCardFeatures(free)) {
    assert.ok(f.title && f.detail, `${f.key} needs owner-facing copy`);
  }

  // 🔴 google_review MUST NOT be pitched. _entitlements.js records that the
  // feature behind it was removed on 2026-08-29 with the Google Business OAuth
  // flow and that nothing can populate google_review_link any more; the key
  // survives in PRO_FEATURES purely as a compatibility surface for cached
  // bundles. Offering it to an owner would be selling a feature that no longer
  // exists — the worst possible upsell.
  assert.ok(!keys.includes("google_review"), "google_review is retired and must never be offered");

  // google_business is shown to Free and Pro alike (founder, 2026-08-29), and
  // booking is a Free-tier feature. Neither is a lock.
  assert.ok(!keys.includes("google_business"), "the Business tile is not Pro-gated");
  assert.ok(!keys.includes("booking"), "Free has booking — fixed weekly windows");

  // Every lockable key must still be a real Pro feature, or the gate is a lie.
  for (const k of keys) {
    assert.ok(PRO_FEATURES.includes(k), `${k} must exist in PRO_FEATURES`);
  }
  assert.equal(keys.length, CARD_LOCKABLE_FEATURES.length);
});

test("a lapsed Pro card is treated as Free for the upsell, exactly like every other gate", () => {
  const lapsed = { subscription_plan: "PRO", subscription_status: "ACTIVE", subscription_expires_at: past };
  assert.ok(lockedCardFeatures(lapsed).length > 0, "lapsed must not keep Pro's empty lock list");
  const cancelled = { subscription_plan: "PRO", subscription_status: "CANCELLED", subscription_expires_at: future };
  assert.ok(lockedCardFeatures(cancelled).length > 0);
});
