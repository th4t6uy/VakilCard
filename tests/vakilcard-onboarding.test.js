// Unit tests for the VakilCard onboarding/dashboard sprint:
// input normalization, validation, publish gating and the client-side DS
// profile mapping (must mirror api/vakilcard/profile.js toDsProfile).
// The lib is authored as ESM for CRA — transpile to CJS on the fly.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

function loadEsm(rel) {
  const babel = require(path.join(__dirname, "..", "node_modules", "@babel", "core"));
  const presetEnv = require(path.join(__dirname, "..", "node_modules", "@babel", "preset-env"));
  const file = path.join(__dirname, "..", "src", rel);
  const { code } = babel.transformSync(fs.readFileSync(file, "utf8"), {
    filename: file,
    presets: [[presetEnv, { targets: { node: "current" } }]],
    configFile: false,
    babelrc: false,
  });
  const m = new Module(file);
  m._compile(code, file);
  return m.exports;
}

const N = loadEsm("lib/vakilcardNormalize.js");

test("website: normalization adds https, upgrades http, validates hostnames", () => {
  assert.equal(N.normalizeWebsite("example.com"), "https://example.com");
  assert.equal(N.normalizeWebsite("http://example.com"), "https://example.com");
  assert.equal(N.normalizeWebsite("  https://a.in/x  "), "https://a.in/x");
  assert.equal(N.normalizeWebsite(""), "");
  assert.ok(N.isValidWebsite("chambers.co.in"));
  assert.ok(N.isValidWebsite("")); // optional
  assert.ok(!N.isValidWebsite("not a url"));
  assert.ok(!N.isValidWebsite("https://nodots"));
});

test("upi: NPCI VPA shapes", () => {
  assert.ok(N.isValidUpi("name@okhdfcbank"));
  assert.ok(N.isValidUpi("a.b-c_d@upi"));
  assert.ok(N.isValidUpi("")); // optional
  assert.ok(!N.isValidUpi("name@"));
  assert.ok(!N.isValidUpi("@bank"));
  assert.ok(!N.isValidUpi("name bank@upi"));
  assert.ok(!N.isValidUpi("name@123bank")); // psp must start with a letter
});

test("phone: Indian mobile with prefixes", () => {
  assert.ok(N.isValidIndianMobile("9876543210"));
  assert.ok(N.isValidIndianMobile("+91 98765 43210"));
  assert.ok(N.isValidIndianMobile("09876543210"));
  assert.ok(!N.isValidIndianMobile("1234567890")); // starts with 1
  assert.ok(!N.isValidIndianMobile("98765"));
});

test("social: handles, @handles, mobile and full URLs → canonical", () => {
  assert.equal(N.normalizeSocial("x", "@advocate_js"), "https://x.com/advocate_js");
  assert.equal(N.normalizeSocial("x", "https://twitter.com/advocate_js"), "https://x.com/advocate_js");
  assert.equal(N.normalizeSocial("x", "https://mobile.twitter.com/advocate_js/status/1"), "https://x.com/advocate_js");
  assert.equal(N.normalizeSocial("instagram", "adv.jasween"), "https://www.instagram.com/adv.jasween");
  assert.equal(N.normalizeSocial("instagram", "https://www.instagram.com/adv.jasween/"), "https://www.instagram.com/adv.jasween");
  assert.equal(N.normalizeSocial("linkedin", "jasween-singh"), "https://www.linkedin.com/in/jasween-singh");
  assert.equal(
    N.normalizeSocial("linkedin", "https://in.linkedin.com/in/jasween-singh/"),
    "https://www.linkedin.com/in/jasween-singh"
  );
  assert.equal(N.normalizeSocial("youtube", "@gautamlaw"), "https://www.youtube.com/@gautamlaw");
  // wrong-platform URL and garbage are rejected (null), empties pass through
  assert.equal(N.normalizeSocial("x", "https://instagram.com/someone"), null);
  assert.equal(N.normalizeSocial("linkedin", "!!!"), null);
  assert.equal(N.normalizeSocial("x", ""), "");
  // unknown platform (barcouncil): any valid https URL passes through
  assert.equal(
    N.normalizeSocial("barcouncil", "barcouncil.org/p/123"),
    "https://barcouncil.org/p/123"
  );
});

test("normalizeSocialLinks: drops empties, reports invalid", () => {
  const { links, invalid } = N.normalizeSocialLinks({
    x: "@a", instagram: "", linkedin: "https://x.com/wrong",
  });
  assert.deepEqual(links, { x: "https://x.com/a" });
  assert.deepEqual(invalid, ["linkedin"]);
});

test("publishBlockers: gates bad phone/website/upi/social, passes clean forms", () => {
  const clean = {
    phone: "9876543210", whatsapp: "", website: "https://chambers.in",
    payment: { upi_id: "name@upi" }, social_links: { x: "https://x.com/a" },
  };
  assert.deepEqual(N.publishBlockers(clean), []);
  const dirty = {
    phone: "12345", whatsapp: "", website: "not a url",
    payment: { upi_id: "bad@" }, social_links: { linkedin: "!!!" },
  };
  const fields = N.publishBlockers(dirty).map((b) => b.field).sort();
  assert.deepEqual(fields, ["linkedin", "phone", "upi", "website"]);
});

test("formToDsProfile mirrors the SSR toDsProfile mapping", () => {
  const f = {
    full_name: "Adv. Sidharth Gautam",
    show_phone: true, phone: "+919425388999",
    show_email: true, email: "s@g.in",
    enrollment_number: "D/2214/2016",
    bio: "Bio.",
    practice_areas: ["Corporate Law", "Arbitration", "Banking", "Cyber"],
    office: { chamber_name: "Gautam Law Associates", address: "4th Floor, CP, New Delhi, 110001" },
    payment: { upi_id: "s@upi", show_upi: true },
  };
  const p = N.formToDsProfile(f);
  assert.equal(p.firmShort, "Gautam");
  assert.equal(p.firmSub, "LAW ASSOCIATES");
  assert.equal(p.tagline, "Corporate Law · Arbitration · Banking");
  assert.equal(p.name, "Adv. Sidharth Gautam");
  assert.equal(p.upi, "s@upi");
  assert.equal(p.firm, "Gautam Law Associates");
  assert.deepEqual(p.address, ["4th Floor, CP", "New Delhi, 110001"]);
  assert.deepEqual(p.contacts.map((c) => c[0]), ["phone", "mail", "pin", "scale"]);
  // empty form still renders sensibly (onboarding step 0)
  const empty = N.formToDsProfile({});
  assert.equal(empty.name, "Your Name");
  assert.equal(empty.tagline, "Litigation · Advisory · Drafting");
});
