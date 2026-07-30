// Free vs Pro: entitlement math + username generation.
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const { isProActive, entitlementsFor, PRO_FEATURES } = require(
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
