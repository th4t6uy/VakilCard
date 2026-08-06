// Unit tests for VakilCard identity: verification pipeline (_verify.js),
// MessagingService (_messaging.js), JWT + refresh rotation (_jwt.js/auth.js),
// username validation (_lib.js) and draft visibility (profile.js).
// Run: node tests/vakilcard-verification.test.js
// No network, no database: `db` is stubbed with an in-memory PostgREST fake
// and the messaging provider is forced to `console`.
process.env.VAKILPEDIA_AUTH_SECRET = "test-secret-do-not-use";
process.env.VERIFICATION_PROVIDER = "console";

const path = require("path");
const assert = require("assert");

/* ---------- in-memory PostgREST stub ---------- */
const store = {};
let idCounter = 1;

function parseFilters(qs) {
  const filters = [];
  for (const [k, v] of new URLSearchParams(qs)) {
    if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
    let m;
    if ((m = /^(eq|gte|in)\.(.*)$/.exec(v))) filters.push({ col: k, op: m[1], val: m[2] });
    else if (v === "is.null") filters.push({ col: k, op: "isnull" });
    else if (v === "not.is.null") filters.push({ col: k, op: "notnull" });
    // or=(...) filters are ignored by the fake — permissive, fine for tests.
  }
  return filters;
}

async function fakeDb(pathq, { method = "GET", body } = {}) {
  const [table, qs = ""] = pathq.split("?");
  const rows = store[table] || (store[table] = []);
  if (method === "POST") {
    const list = Array.isArray(body) ? body : [body];
    const created = list.map((b) => ({
      id: `id-${idCounter++}`, attempts: 0, resend_count: 0, max_attempts: 5,
      status: "pending", is_published: b.is_published, created_at: new Date().toISOString(), ...b,
    }));
    rows.push(...created);
    return created;
  }
  const filters = parseFilters(qs);
  const match = (r) =>
    filters.every((f) =>
      f.op === "eq" ? String(r[f.col]) === f.val :
      f.op === "gte" ? String(r[f.col] || "") >= f.val :
      f.op === "isnull" ? r[f.col] == null :
      f.op === "notnull" ? r[f.col] != null :
      f.op === "in" ? f.val.replace(/[()]/g, "").split(",").includes(String(r[f.col])) : true
    );
  if (method === "PATCH") {
    rows.filter(match).forEach((r) => Object.assign(r, body));
    return [];
  }
  if (method === "DELETE") {
    for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1);
    return [];
  }
  let out = rows.filter(match);
  const params = new URLSearchParams(qs);
  if ((params.get("order") || "").startsWith("created_at.desc"))
    out = [...out].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (params.get("limit")) out = out.slice(0, +params.get("limit"));
  return out;
}

// Inject the stub before anything loads _lib.
const libPath = path.resolve(__dirname, "../api/vakilcard/_lib.js");
const real = require(libPath);
require.cache[libPath].exports = { ...real, db: fakeDb };
const verification = require("../api/vakilcard/_verify.js");
const jwt = require("../api/vakilcard/_jwt.js");
const authHandler = require("../api/vakilcard/auth.js");
const { validateUsername } = real;

/* ---------- helpers ---------- */
const PHONE = "+919876543210";
const latestSession = () => store.verification_sessions[store.verification_sessions.length - 1];
const extractCode = (logs) => {
  for (const l of logs) {
    const m = /\[messaging:console\] \+\d+ -> (\d{6})$/.exec(l);
    if (m) return m[1];
  }
  return null;
};
function captureConsole(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  return fn().finally(() => (console.log = orig)).then((r) => ({ r, logs }));
}
function reset() {
  for (const k of Object.keys(store)) store[k] = [];
  store.message_templates = [
    { name: "phone_verification_code", language: "en", provider_ref: "vakilpedia_otp", active: true },
    { name: "vakilcard_welcome", language: "en", provider_ref: "vakilcard_welcome", active: true },
  ];
}
function fakeRes() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; }, statusCode: 0 };
}
async function callAuth(body) {
  const res = fakeRes();
  await authHandler({ method: "POST", body, headers: { "user-agent": "test" }, socket: { remoteAddress: "1.1.1.1" } }, res);
  return { status: res.statusCode, data: JSON.parse(res.body) };
}

/* ---------- tests ---------- */
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("normalizePhone: E.164 normalization incl. bare Indian numbers", () => {
  assert.equal(verification.normalizePhone("98765 43210"), "+919876543210");
  assert.equal(verification.normalizePhone("+91 98765-43210"), "+919876543210");
  assert.equal(verification.normalizePhone("919876543210"), "+919876543210");
  assert.equal(verification.normalizePhone("+14155552671"), "+14155552671");
  assert.equal(verification.normalizePhone("abc"), null);
});

test("happy path: send → verify, single-use, no raw code stored", async () => {
  reset();
  const { logs } = await captureConsole(() =>
    verification.sendVerification({ phone: "9876543210", ip: "1.2.3.4", userAgent: "t" })
  );
  const code = extractCode(logs);
  assert.match(code, /^\d{6}$/);
  assert.ok(!JSON.stringify(store.verification_sessions).includes(code), "raw code must never be stored");
  const v = await verification.verify({ phone: PHONE, code });
  assert.equal(v.ok, true);
  assert.equal(latestSession().status, "consumed");
  assert.equal((await verification.verify({ phone: PHONE, code })).error, "no_session");
});

test("wrong code: attempts increment, 5th failure locks", async () => {
  reset();
  await captureConsole(() => verification.sendVerification({ phone: PHONE }));
  for (let i = 1; i <= 4; i++)
    assert.equal((await verification.verify({ phone: PHONE, code: "000000" })).attemptsLeft, 5 - i);
  await verification.verify({ phone: PHONE, code: "000000" });
  assert.equal(latestSession().status, "locked");
});

test("expired code rejected", async () => {
  reset();
  const { logs } = await captureConsole(() => verification.sendVerification({ phone: PHONE }));
  latestSession().expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await verification.verify({ phone: PHONE, code: extractCode(logs) })).error, "expired");
});

test("resend cooldown + hourly phone/IP rate limits", async () => {
  reset();
  await captureConsole(() => verification.sendVerification({ phone: PHONE }));
  const r2 = await verification.resend({ phone: PHONE });
  assert.equal(r2.error, "cooldown");
  assert.ok(r2.retryAfterSec > 0 && r2.retryAfterSec <= 60);
  for (let i = 0; i < 4; i++) {
    latestSession().last_sent_at = new Date(Date.now() - 120000).toISOString();
    await captureConsole(() => verification.sendVerification({ phone: PHONE }));
  }
  latestSession().last_sent_at = new Date(Date.now() - 120000).toISOString();
  assert.equal((await verification.sendVerification({ phone: PHONE })).error, "rate_limited");
  reset();
  for (let i = 0; i < 15; i++) {
    await captureConsole(() =>
      verification.sendVerification({ phone: `+9198765000${String(i).padStart(2, "0")}`, ip: "9.9.9.9" })
    );
    latestSession().last_sent_at = new Date(Date.now() - 120000).toISOString();
  }
  assert.equal(
    (await verification.sendVerification({ phone: "+919876599999", ip: "9.9.9.9" })).error,
    "rate_limited"
  );
});

test("audit log records lifecycle", async () => {
  reset();
  const { logs } = await captureConsole(() => verification.sendVerification({ phone: PHONE, ip: "1.1.1.1" }));
  await verification.verify({ phone: PHONE, code: "000000" });
  await verification.verify({ phone: PHONE, code: extractCode(logs) });
  const events = store.identity_audit_log.map((e) => e.event);
  for (const e of ["verification_requested", "verification_sent", "verification_failed", "verification_success"])
    assert.ok(events.includes(e), `missing ${e}`);
});

test("JWT: roundtrip, tamper + expiry rejected; access TTL is 1h", () => {
  const token = jwt.sign({ sub: "acc-1", typ: "access" });
  const claims = jwt.verify(token);
  assert.equal(claims.sub, "acc-1");
  assert.equal(claims.exp - claims.iat, 3600, "access tokens are short-lived (1h)");
  assert.equal(jwt.verify(token.slice(0, -2) + "xx"), null);
  assert.equal(jwt.verify(jwt.sign({ sub: "a" }, { expiresInSec: -10 })), null);
});

test("validateUsername: hardening rules", () => {
  const ok = (s, o) => assert.equal(validateUsername(s, o).ok, true, s);
  const bad = (s, reason, o) => {
    const r = validateUsername(s, o);
    assert.equal(r.ok, false, s);
    if (reason) assert.equal(r.reason, reason, `${s} -> ${r.reason}`);
  };
  ok("jasween"); ok("jasween-gujral"); ok("gujral_law"); ok("j.s.gujral");
  ok("ＪＡＳＷＥＥＮ"); // fullwidth → NFKC → ascii
  bad("ab", "invalid");                 // 1-2 chars reserved by rule
  bad("a", "invalid");
  bad(".jasween", "invalid");           // leading dot
  bad("jasween.", "invalid");           // trailing dot
  bad("jas..ween", "invalid");          // consecutive separators
  bad("jas--ween", "invalid");
  bad("jas ween", "invalid_characters");
  bad("jas​ween", "invalid_characters"); // invisible zero-width
  bad("jas😀", "invalid_characters");   // emoji
  bad("con", "reserved"); bad("com5", "reserved"); bad("lpt9", "reserved"); // windows names
  bad("../etc", "invalid");             // path traversal
  bad("987654", "numeric_not_allowed"); // pure numeric (user-chosen)
  ok("9876543210", { allowNumeric: true }); // system phone username
});

test("auth verify: creates DRAFT card, reserved alias, token pair, welcome via MessagingService", async () => {
  reset();
  const { logs } = await captureConsole(() => verification.sendVerification({ phone: PHONE }));
  const code = extractCode(logs);
  let out;
  await captureConsole(async () => { out = await callAuth({ action: "verify", phone: PHONE, code }); });
  assert.equal(out.status, 200);
  assert.equal(out.data.created, true);
  assert.equal(out.data.username, "9876543210");
  assert.equal(out.data.published, false, "card must start as a draft");
  assert.ok(out.data.access_token && out.data.refresh_token.startsWith("vkr_"));
  assert.equal(out.data.token, out.data.access_token, "back-compat token field");
  const prof = store.vakilcard_profiles[0];
  assert.equal(prof.is_published, false);
  assert.equal(store.vakilcard_aliases[0].alias, "9876543210");
  const welcome = store.message_log.find((m) => m.template_name === "vakilcard_welcome");
  assert.ok(welcome, "welcome sent through MessagingService");
  assert.equal(welcome.module, "utility");
  // Approved Meta template takes exactly ONE variable: the permanent card URL.
  assert.deepEqual(welcome.variables.bodyParams, ["https://www.vakilpedia.com/9876543210"]);
  assert.ok(!JSON.stringify(store.refresh_tokens).includes(out.data.refresh_token), "refresh stored as hash only");
});

test("refresh rotation + reuse detection + logout", async () => {
  reset();
  let logs;
  ({ logs } = await captureConsole(() => verification.sendVerification({ phone: PHONE })));
  let out;
  await captureConsole(async () => { out = await callAuth({ action: "verify", phone: PHONE, code: extractCode(logs) }); });
  const r1 = out.data.refresh_token;

  const r2res = await callAuth({ action: "refresh", refresh_token: r1 });
  assert.equal(r2res.status, 200);
  const r2 = r2res.data.refresh_token;
  assert.notEqual(r1, r2, "rotation issues a new token");

  // Reuse of the rotated (revoked) token = theft: everything gets revoked.
  const reuse = await callAuth({ action: "refresh", refresh_token: r1 });
  assert.equal(reuse.status, 401);
  const reuse2 = await callAuth({ action: "refresh", refresh_token: r2 });
  assert.equal(reuse2.status, 401, "reuse detection revokes the whole family");

  // Fresh login, then logout invalidates.
  reset();
  ({ logs } = await captureConsole(() => verification.sendVerification({ phone: PHONE })));
  await captureConsole(async () => { out = await callAuth({ action: "verify", phone: PHONE, code: extractCode(logs) }); });
  await callAuth({ action: "logout", refresh_token: out.data.refresh_token });
  assert.equal((await callAuth({ action: "refresh", refresh_token: out.data.refresh_token })).status, 401);
});

test("second verification for same phone reuses the account (no duplicate cards)", async () => {
  reset();
  let logs, out;
  ({ logs } = await captureConsole(() => verification.sendVerification({ phone: PHONE })));
  await captureConsole(async () => { out = await callAuth({ action: "verify", phone: PHONE, code: extractCode(logs) }); });
  latestSession().last_sent_at = new Date(Date.now() - 120000).toISOString();
  ({ logs } = await captureConsole(() => verification.sendVerification({ phone: PHONE })));
  let out2;
  await captureConsole(async () => { out2 = await callAuth({ action: "verify", phone: PHONE, code: extractCode(logs) }); });
  assert.equal(out2.data.created, false);
  assert.equal(out2.data.account_id, out.data.account_id);
  assert.equal(store.vakilcard_profiles.length, 1);
});

test("draft cards are not public (profile SSR + vcf)", async () => {
  const profilePath = path.resolve(__dirname, "../api/vakilcard/profile.js");
  const vcfPath = path.resolve(__dirname, "../api/vakilcard/vcf.js");
  const bundle = { id: "x", username: "9876543210", full_name: "Advocate", offices: [], practice_areas: [], payment: null, is_published: false };
  const stub = { ...require.cache[libPath].exports, resolveProfileOrAlias: async () => ({ draft: true, profile: bundle }), trackEvent: async () => {} };
  delete require.cache[profilePath]; delete require.cache[vcfPath];
  const saved = require.cache[libPath].exports;
  require.cache[libPath].exports = stub;
  const profileHandler = require(profilePath);
  const vcfHandler = require(vcfPath);
  require.cache[libPath].exports = saved;

  const res = fakeRes();
  await profileHandler({ query: { username: "9876543210" }, headers: { "user-agent": "Mozilla" } }, res);
  assert.equal(res.statusCode, 404, "draft is 404 to the public");
  assert.equal(res.headers["X-Robots-Tag"], "noindex");
  assert.ok(res.body.includes("noindex") && res.body.includes("published"), "friendly not-published page");
  assert.ok(!res.body.includes("Claim this username"), "draft page must not offer the reserved name");

  const res2 = fakeRes();
  await vcfHandler({ query: { username: "9876543210" }, headers: {} }, res2);
  assert.equal(res2.statusCode, 404, "no vCard for drafts");
});

test("preview token renders draft via the production renderer; bad token stays 404", async () => {
  const profilePath = path.resolve(__dirname, "../api/vakilcard/profile.js");
  const bundle = { id: "prof-1", username: "9876543210", full_name: "Advocate Test", designation: null, bio: null, photo_url: null, email: null, phone: "+919876543210", whatsapp: null, website: null, show_email: true, show_phone: true, theme_preference: "system", languages: [], practice_areas: [], offices: [], payment: null, social_links: {}, is_published: false };
  const saved = require.cache[libPath].exports;
  require.cache[libPath].exports = { ...saved, resolveProfileOrAlias: async () => ({ draft: true, profile: bundle }), trackEvent: async () => {} };
  delete require.cache[profilePath];
  const handler = require(profilePath);
  require.cache[libPath].exports = saved;

  const good = jwt.sign({ pid: "prof-1", typ: "preview" }, { expiresInSec: 900 });
  const res = fakeRes();
  await handler({ query: { username: "9876543210", pt: good }, headers: { "user-agent": "Mozilla" } }, res);
  assert.equal(res.statusCode, 200, "valid preview token renders the real card");
  assert.equal(res.headers["X-Robots-Tag"], "noindex");
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.ok(res.body.includes("Advocate Test"), "renders actual profile content");

  const wrongPid = jwt.sign({ pid: "someone-else", typ: "preview" }, { expiresInSec: 900 });
  const res2 = fakeRes();
  await handler({ query: { username: "9876543210", pt: wrongPid }, headers: { "user-agent": "Mozilla" } }, res2);
  assert.equal(res2.statusCode, 404, "pid-mismatched token is rejected");

  const accessToken = jwt.sign({ sub: "acc", pid: "prof-1", typ: "access" });
  const res3 = fakeRes();
  await handler({ query: { username: "9876543210", pt: accessToken }, headers: { "user-agent": "Mozilla" } }, res3);
  assert.equal(res3.statusCode, 404, "access tokens cannot be used as preview tokens");
});

test("consolidated profile tracking handler (profile.js POST)", async () => {
  const profilePath = path.resolve(__dirname, "../api/vakilcard/profile.js");
  const trackCalls = [];
  const fakeTrackEvent = async (profileId, eventType, referrer) => {
    trackCalls.push({ profileId, eventType, referrer });
  };
  const saved = require.cache[libPath].exports;
  const bundle = { id: "11111111-2222-3333-4444-555555555555", username: "9876543210", full_name: "Advocate Test", designation: null, bio: null, photo_url: null, email: null, phone: "+919876543210", whatsapp: null, website: null, show_email: true, show_phone: true, theme_preference: "system", languages: [], practice_areas: [], offices: [], payment: null, social_links: {}, is_published: true };

  require.cache[libPath].exports = {
    ...saved,
    trackEvent: fakeTrackEvent,
    resolveProfileOrAlias: async () => ({ profile: bundle }),
  };
  delete require.cache[profilePath];
  const handler = require(profilePath);

  // 1. Profile view track event (GET with user-agent, auto-tracked on render)
  const resGet = fakeRes();
  await handler({ method: "GET", query: { username: "9876543210" }, headers: { "user-agent": "Mozilla", "referer": "https://google.com" } }, resGet);
  assert.equal(resGet.statusCode, 200);
  assert.equal(trackCalls.length, 1);
  assert.equal(trackCalls[0].profileId, "11111111-2222-3333-4444-555555555555");
  assert.equal(trackCalls[0].eventType, "view");
  assert.equal(trackCalls[0].referrer, "https://google.com");

  // 2. Explicit post track event (POST, like a sendBeacon call)
  const resPost = fakeRes();
  trackCalls.length = 0;
  await handler({
    method: "POST",
    headers: { "referer": "https://facebook.com" },
    body: { profile_id: "11111111-2222-3333-4444-555555555555", event_type: "share" }
  }, resPost);
  assert.equal(resPost.statusCode, 204);
  assert.equal(trackCalls.length, 1);
  assert.equal(trackCalls[0].profileId, "11111111-2222-3333-4444-555555555555");
  assert.equal(trackCalls[0].eventType, "share");
  assert.equal(trackCalls[0].referrer, "https://facebook.com");

  // Cleanup stub
  require.cache[libPath].exports = saved;
});

/* ---------- runner ---------- */
(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.error(`PASS  ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL  ${name}\n      ${e.message}`);
    }
  }
  console.error(failed ? `\n${failed} test(s) FAILED` : `\nAll ${tests.length} tests passed`);
  process.exit(failed ? 1 : 0);
})();
