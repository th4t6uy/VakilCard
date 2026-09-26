// The admin panel's per-app switches, VakilCard side. THE property that matters: it FAILS OPEN.
// Run: node tests/vakilcard-controls.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const c = require(path.join(__dirname, "..", "api", "vakilcard", "_controls.js"));
const NOW = new Date("2026-09-26T10:00:00Z");
const ENV = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "svc" };

test("a full reply is understood", () => {
  const v = c.normalizeControls(
    {
      maintenance: true,
      maintenanceMessage: "Back at 6pm",
      notice: { title: "Heads up", body: "New feature", level: "warning", until: "2026-09-30T00:00:00Z" },
      purchasesEnabled: false,
      signupsEnabled: false,
    },
    "vakilcard",
    NOW
  );
  assert.equal(v.maintenance, true);
  assert.equal(v.maintenanceMessage, "Back at 6pm");
  assert.equal(v.notice.level, "warning");
  assert.equal(v.purchasesEnabled, false);
  assert.equal(v.signupsEnabled, false);
});

test("junk means everything on", () => {
  for (const junk of [null, undefined, 42, "x", [], {}]) {
    assert.deepEqual(c.normalizeControls(junk, "vakilcard", NOW), c.defaults("vakilcard"));
  }
});

test("only an explicit false switches purchases / sign-ups off", () => {
  const v = c.normalizeControls({ purchasesEnabled: "no", signupsEnabled: 0, maintenance: "yes" }, "vakilcard", NOW);
  assert.equal(v.purchasesEnabled, true);
  assert.equal(v.signupsEnabled, true);
  assert.equal(v.maintenance, false);
});

test("expired / blank notices dropped; bad level becomes info; maintenance message needs maintenance", () => {
  assert.equal(c.normalizeControls({ notice: { body: "old", until: "2026-09-01T00:00:00Z" } }, "v", NOW).notice, null);
  assert.equal(c.normalizeControls({ notice: { body: "  " } }, "v", NOW).notice, null);
  assert.equal(c.normalizeControls({ notice: { body: "hi", level: "loud" } }, "v", NOW).notice.level, "info");
  assert.equal(c.normalizeControls({ maintenance: false, maintenanceMessage: "stale" }, "v", NOW).maintenanceMessage, null);
});

test("getControls posts the product id to the public RPC", async () => {
  c.clearCache();
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ purchasesEnabled: false }) };
  };
  const v = await c.getControls({ fetchImpl, env: ENV });
  assert.equal(v.purchasesEnabled, false);
  assert.equal(seen.url, "https://x.supabase.co/rest/v1/rpc/supracore_product_controls_public");
  assert.deepEqual(JSON.parse(seen.init.body), { p_product_id: "vakilcard" });
  assert.equal(seen.init.headers.apikey, "svc");
});

test("getControls FAILS OPEN: http error, thrown error, bad json, timeout, no env", async () => {
  const on = c.defaults("vakilcard");
  const cases = [
    async () => ({ ok: false, json: async () => ({}) }),
    async () => { throw new Error("offline"); },
    async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }),
    (_u, init) => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))),
  ];
  for (const fetchImpl of cases) {
    c.clearCache();
    assert.deepEqual(await c.getControls({ fetchImpl, env: ENV, timeoutMs: 20 }), on);
  }
  c.clearCache();
  assert.deepEqual(await c.getControls({ env: {} }), on);
});

test("getControls caches a good answer for 60 s and a failure for 15 s", async () => {
  c.clearCache();
  let calls = 0;
  const good = async () => { calls++; return { ok: true, json: async () => ({ maintenance: true }) }; };
  await c.getControls({ fetchImpl: good, env: ENV, nowMs: 1_000_000 });
  await c.getControls({ fetchImpl: good, env: ENV, nowMs: 1_030_000 });
  assert.equal(calls, 1);
  await c.getControls({ fetchImpl: good, env: ENV, nowMs: 1_061_000 });
  assert.equal(calls, 2);

  c.clearCache();
  let fails = 0;
  const bad = async () => { fails++; throw new Error("x"); };
  await c.getControls({ fetchImpl: bad, env: ENV, nowMs: 2_000_000 });
  await c.getControls({ fetchImpl: bad, env: ENV, nowMs: 2_010_000 });
  assert.equal(fails, 1);
  await c.getControls({ fetchImpl: bad, env: ENV, nowMs: 2_016_000 });
  assert.equal(fails, 2);
});
