// Unit tests for VakilCard image upload/removal (api/vakilcard/upload.js).
// Run: node tests/vakilcard-upload.test.js
// No network, no database: `_lib` is stubbed (db + resolveAccount) and
// global fetch captures Supabase Storage calls. Covers the multi-format
// pipeline (WebP preferred; PNG/JPEG accepted for browsers without a WebP
// encoder — the Safari fix), one-object-per-kind cleanup, server-side URL
// persistence, delete, and rejection paths.
const path = require("path");
const assert = require("assert");

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.SUPABASE_URL = "https://example.supabase.co";

/* ---------- stubs ---------- */
const store = { vakilcard_profiles: [{ id: "prof-1", account_id: "acc-1", photo_url: null }] };
const dbCalls = [];
async function fakeDb(pathq, opts = {}) {
  dbCalls.push({ pathq, opts });
  const [table] = pathq.split("?");
  if (table === "vakilcard_profiles") {
    if ((opts.method || "GET") === "PATCH") {
      Object.assign(store.vakilcard_profiles[0], opts.body);
      return [];
    }
    return store.vakilcard_profiles;
  }
  if (table === "vakilcard_payment_prefs") {
    store.vakilcard_payment_prefs = [{ ...(store.vakilcard_payment_prefs || [{}])[0], ...opts.body }];
    return [];
  }
  return [];
}

let currentAccount = { accountId: "acc-1", via: "jwt" };
const libPath = path.resolve(__dirname, "../api/vakilcard/_lib.js");
const real = require(libPath);
require.cache[libPath].exports = {
  ...real,
  db: fakeDb,
  resolveAccount: async () => currentAccount,
};

const storageCalls = [];
global.fetch = async (url, opts = {}) => {
  storageCalls.push({ url: String(url), method: opts.method || "GET", headers: opts.headers || {} });
  return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
};

const handler = require("../api/vakilcard/upload.js");

/* ---------- helpers ---------- */
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)]);
const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n"), Buffer.alloc(20)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);

function fakeReq(method, body) {
  const raw = Buffer.from(JSON.stringify(body));
  return {
    method,
    headers: { authorization: "Bearer x" },
    [Symbol.asyncIterator]: async function* () { yield raw; },
  };
}
function fakeRes() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; }, statusCode: 0 };
}
async function call(method, body) {
  const res = fakeRes();
  await handler(fakeReq(method, body), res);
  return { status: res.statusCode, data: JSON.parse(res.body) };
}
function resetCalls() { storageCalls.length = 0; dbCalls.length = 0; }

/* ---------- tests ---------- */
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("photo WebP: stored as photo.webp, siblings cleaned, URL persisted", async () => {
  resetCalls();
  const { status, data } = await call("POST", { kind: "photo", data: WEBP.toString("base64") });
  assert.equal(status, 200);
  assert.ok(data.url.includes("/vakilcard/prof-1/photo.webp?v="));
  const put = storageCalls.find((c) => c.method === "POST");
  assert.ok(put.url.endsWith("/object/vakilcard/prof-1/photo.webp"));
  const deletes = storageCalls.filter((c) => c.method === "DELETE").map((c) => c.url);
  assert.ok(deletes.some((u) => u.endsWith("photo.png")) && deletes.some((u) => u.endsWith("photo.jpg")),
    "other extensions cleaned on replace");
  assert.ok(store.vakilcard_profiles[0].photo_url.includes("photo.webp"), "photo_url persisted server-side");
});

test("photo JPEG (Safari fallback — no WebP encoder): accepted", async () => {
  resetCalls();
  const { status, data } = await call("POST", { kind: "photo", data: JPEG.toString("base64") });
  assert.equal(status, 200);
  assert.ok(data.url.includes("photo.jpg?v="));
});

test("QR PNG (lossless): stored as upiqr.png, upi_qr_url upserted", async () => {
  resetCalls();
  const { status, data } = await call("POST", { kind: "upiqr", data: PNG.toString("base64") });
  assert.equal(status, 200);
  assert.ok(data.url.includes("upiqr.png?v="));
  assert.equal(store.vakilcard_payment_prefs[0].profile_id, "prof-1");
  assert.ok(store.vakilcard_payment_prefs[0].upi_qr_url.includes("upiqr.png"));
});

test("every Storage call carries apikey AND Authorization (2026-08-31 outage)", async () => {
  // Storage refused EVERY write project-wide -- {"code":"AccessDenied",
  // "message":"Invalid Compact JWS"} -- for as long as it took to notice,
  // because these two calls sent Authorization alone. A publishable/secret
  // key (sb_secret_...) is only honoured in Authorization when it exactly
  // equals the apikey header; sent alone it is parsed as a JWT and rejected.
  // Every DB call kept working the whole time, because _lib.js has always
  // sent both -- which is why nothing else looked broken.
  //
  // This asserts the header pair on POST *and* DELETE. Delete this at your
  // peril: photo and QR upload are the only things in the product that write
  // to Storage, so nothing else would catch the regression.
  resetCalls();
  await call("POST", { kind: "upiqr", data: PNG.toString("base64") });
  assert.ok(storageCalls.length, "expected storage traffic");
  for (const c of storageCalls) {
    const h = c.headers || {};
    assert.ok(h.apikey, `${c.method} ${c.url} sent no apikey header`);
    assert.equal(
      h.Authorization,
      `Bearer ${h.apikey}`,
      `${c.method}: Authorization must be the same key as apikey`
    );
  }
  const methods = new Set(storageCalls.map((c) => c.method));
  assert.ok(methods.has("POST") && methods.has("DELETE"), "both verbs covered");
});

test("rejections: empty, non-image magic, oversized", async () => {
  assert.equal((await call("POST", { kind: "photo", data: "" })).status, 400);
  const garbage = Buffer.from("GIF89a-not-accepted-here....").toString("base64");
  assert.equal((await call("POST", { kind: "photo", data: garbage })).status, 415);
  const big = Buffer.concat([WEBP, Buffer.alloc(401 * 1024)]).toString("base64");
  assert.equal((await call("POST", { kind: "photo", data: big })).status, 413);
});

test("DELETE: removes every extension and clears the stored URL", async () => {
  resetCalls();
  const { status } = await call("DELETE", { kind: "photo" });
  assert.equal(status, 200);
  const deletes = storageCalls.filter((c) => c.method === "DELETE").map((c) => c.url);
  for (const ext of ["webp", "png", "jpg"])
    assert.ok(deletes.some((u) => u.endsWith(`photo.${ext}`)), `deletes .${ext}`);
  assert.equal(store.vakilcard_profiles[0].photo_url, null);
});

test("storage failure: Supabase's real status is captured and forwarded (2026-08-17)", async () => {
  resetCalls();
  const origFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    storageCalls.push({ url: String(url), method: opts.method || "GET" });
    if ((opts.method || "GET") === "POST") {
      return { ok: false, status: 403, json: async () => ({}), text: async () => "mock: forbidden" };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
  };
  try {
    const { status, data } = await call("POST", { kind: "photo", data: WEBP.toString("base64") });
    assert.equal(status, 502);
    assert.equal(data.error, "storage_failed");
    assert.equal(data.status, 403, "the real Supabase status must reach the response for triage");
  } finally {
    global.fetch = origFetch;
  }
});

test("unauthenticated and bad methods rejected", async () => {
  currentAccount = null;
  assert.equal((await call("POST", { kind: "photo", data: WEBP.toString("base64") })).status, 401);
  currentAccount = { accountId: "acc-1", via: "jwt" };
  assert.equal((await call("GET", {})).status, 405);
});

/* ---------- runner ---------- */
(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log("PASS ", name);
    } catch (e) {
      failed++;
      console.log("FAIL ", name);
      console.log("      " + String(e.message).split("\n").join("\n      "));
    }
  }
  console.log(failed ? `\n${failed} test(s) FAILED` : `\nAll ${tests.length} tests passed`);
  process.exit(failed ? 1 : 0);
})();
