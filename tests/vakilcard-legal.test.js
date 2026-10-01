// Consent inside VakilCard (ROUTE A, 2026-10-01): legal_outstanding / legal_accept in auth.js
// (logic in api/vakilcard/_legal.js), and the removal of the browser-trusted `eula_accepted` flag.
// Run: node tests/vakilcard-legal.test.js
// No network, no database: `db` is replaced by a recording fake before auth.js loads.
process.env.VAKILPEDIA_AUTH_SECRET = "test-secret-do-not-use";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const calls = [];
let rpcAnswers = {};
function resetFake() {
  calls.length = 0;
  rpcAnswers = {};
}
async function fakeDb(pathq, opts = {}) {
  calls.push({ path: pathq, method: opts.method || "GET", body: opts.body });
  if (pathq.startsWith("rpc/")) {
    const name = pathq.slice(4);
    const ans = rpcAnswers[name];
    if (ans instanceof Error) throw ans;
    if (typeof ans === "function") return ans(opts.body);
    if (ans !== undefined) return ans;
    throw new Error("unexpected rpc " + name);
  }
  return []; // PATCHes and anything else
}

const libPath = path.resolve(__dirname, "../api/vakilcard/_lib.js");
const real = require(libPath);
require.cache[libPath].exports = { ...real, db: fakeDb };
const jwt = require("../api/vakilcard/_jwt.js");
const authHandler = require("../api/vakilcard/auth.js");

const ACC = "11111111-1111-4111-8111-111111111111";
const D_TERMS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const D_PRIV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const D_VC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D_CQ = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const owedVakilcard = {
  ok: true,
  productId: "vakilcard",
  satisfied: false,
  outstanding: [
    { id: D_TERMS, scope: "platform", productId: null, kind: "terms", version: "1", url: "https://account.vakilpedia.com/legal/documents/terms" },
    { id: D_PRIV, scope: "platform", productId: null, kind: "privacy", version: "1", url: "https://account.vakilpedia.com/legal/documents/privacy" },
    { id: D_VC, scope: "product", productId: "vakilcard", kind: "eula", version: "1", url: "https://account.vakilpedia.com/legal/documents/vakilcard-eula" },
  ],
};
const owedCourtque = {
  ok: true,
  productId: "courtque",
  satisfied: false,
  outstanding: [
    { id: D_CQ, scope: "product", productId: "courtque", kind: "eula", version: "1", url: "https://account.vakilpedia.com/legal/documents/courtque-eula" },
  ],
};

function call(body, { token = jwt.sign({ sub: ACC, typ: "access" }), headers = {} } = {}) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; }, statusCode: 0 };
  const req = {
    method: "POST",
    body,
    headers: { "user-agent": "UA-test/1.0", "x-forwarded-for": "9.9.9.9, 1.1.1.1", ...(token ? { authorization: "Bearer " + token } : {}), ...headers },
    socket: { remoteAddress: "2.2.2.2" },
  };
  return authHandler(req, res).then(() => ({ status: res.statusCode, data: JSON.parse(res.body) }));
}
const rpcCalls = (name) => calls.filter((c) => c.path === "rpc/" + name);
const patches = () => calls.filter((c) => c.method === "PATCH" && c.path.startsWith("vakilpedia_accounts"));

test("legal_outstanding: account from the token, product defaults to vakilcard, list passed through", async () => {
  resetFake();
  rpcAnswers.supracore_legal_outstanding = owedVakilcard;
  const r = await call({ action: "legal_outstanding", account_id: "evil", accountId: "evil" });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.outstanding.length, 3);
  assert.deepEqual(rpcCalls("supracore_legal_outstanding")[0].body, { p_account_id: ACC, p_product_id: "vakilcard" });
});

test("legal_outstanding: needs a signed-in token", async () => {
  resetFake();
  const r = await call({ action: "legal_outstanding" }, { token: null });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, "not_signed_in");
  const r2 = await call({ action: "legal_accept", documentIds: [D_TERMS] }, { token: "garbage" });
  assert.equal(r2.status, 401);
  assert.equal(calls.length, 0, "no database call without a valid token");
});

test("product comes from a fixed allow-list only", async () => {
  for (const bad of ["caselinx", "vakilcard; drop", "__proto__", "constructor", { a: 1 }, ["vakilcard"], 7]) {
    resetFake();
    const o = await call({ action: "legal_outstanding", product: bad });
    assert.equal(o.status, 400, JSON.stringify(bad));
    assert.equal(o.data.error, "unknown_product");
    const a = await call({ action: "legal_accept", product: bad, documentIds: [D_TERMS] });
    assert.equal(a.status, 400, JSON.stringify(bad));
    assert.equal(calls.length, 0, "an unknown product never reaches the database");
  }
  resetFake();
  rpcAnswers.supracore_legal_outstanding = owedCourtque;
  const ok = await call({ action: "legal_outstanding", product: "courtque" });
  assert.equal(ok.status, 200);
  assert.equal(rpcCalls("supracore_legal_outstanding")[0].body.p_product_id, "courtque");
});

test("legal_accept: ONE accept call, server-side ip + user agent, product activated, legacy column stamped after success", async () => {
  resetFake();
  rpcAnswers.supracore_legal_outstanding = owedVakilcard;
  rpcAnswers.supracore_legal_accept = { ok: true, consentRecordIds: ["r1", "r2", "r3"], alreadyAccepted: [], activated: [{ productId: "vakilcard" }] };
  const r = await call({
    action: "legal_accept",
    product: "vakilcard",
    documentIds: [D_TERMS, D_PRIV, D_VC],
    viewedDocumentIds: [D_VC],
    account_id: "evil", // must be ignored
    ip: "6.6.6.6", // must be ignored
    userAgent: "evil", // must be ignored
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.deepEqual(r.data.consentRecordIds, ["r1", "r2", "r3"]);
  const acc = rpcCalls("supracore_legal_accept");
  assert.equal(acc.length, 1, "exactly one accept call");
  assert.deepEqual(acc[0].body, {
    p_account_id: ACC,
    p_document_ids: [D_TERMS, D_PRIV, D_VC],
    p_ip: "9.9.9.9",
    p_user_agent: "UA-test/1.0",
    p_viewed_document_ids: [D_VC],
    p_activate_product_ids: ["vakilcard"],
  });
  const p = patches();
  assert.equal(p.length, 1);
  assert.equal(p[0].path, `vakilpedia_accounts?id=eq.${ACC}&eula_vakilcard_accepted_at=is.null`);
  assert.ok(Object.keys(p[0].body).join() === "eula_vakilcard_accepted_at");
  // order: the legacy stamp comes AFTER the real accept
  assert.ok(calls.findIndex((c) => c === p[0]) > calls.findIndex((c) => c === acc[0]));
});

test("legal_accept without the app's own agreement: nothing is activated, no legacy stamp", async () => {
  resetFake();
  rpcAnswers.supracore_legal_outstanding = owedVakilcard;
  rpcAnswers.supracore_legal_accept = { ok: true, consentRecordIds: ["r1", "r2"], alreadyAccepted: [] };
  const r = await call({ action: "legal_accept", documentIds: [D_TERMS, D_PRIV] });
  assert.equal(r.status, 200);
  const body = rpcCalls("supracore_legal_accept")[0].body;
  assert.equal(body.p_activate_product_ids, null);
  assert.equal(body.p_viewed_document_ids, null);
  assert.equal(patches().length, 0);
});

test("legal_accept for courtque stamps the courtque column and activates courtque only", async () => {
  resetFake();
  rpcAnswers.supracore_legal_outstanding = owedCourtque;
  rpcAnswers.supracore_legal_accept = { ok: true, consentRecordIds: ["r9"], alreadyAccepted: [] };
  const r = await call({ action: "legal_accept", product: "courtque", documentIds: [D_CQ] });
  assert.equal(r.status, 200);
  assert.deepEqual(rpcCalls("supracore_legal_accept")[0].body.p_activate_product_ids, ["courtque"]);
  assert.equal(patches()[0].path, `vakilpedia_accounts?id=eq.${ACC}&eula_courtque_accepted_at=is.null`);
});

test("a document the browser calls an agreement is not trusted: only the database's list decides activation", async () => {
  resetFake();
  rpcAnswers.supracore_legal_outstanding = owedVakilcard;
  rpcAnswers.supracore_legal_accept = { ok: true, consentRecordIds: ["r"], alreadyAccepted: [] };
  const OTHER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await call({ action: "legal_accept", documentIds: [OTHER], activateProductIds: ["vakilcard"], activate: true });
  assert.equal(rpcCalls("supracore_legal_accept")[0].body.p_activate_product_ids, null);
  assert.equal(patches().length, 0);
});

test("legal_accept: awaiting-approval account is refused with the real code + accountStatus, nothing stamped", async () => {
  resetFake();
  rpcAnswers.supracore_legal_outstanding = { ok: false, error: "account_not_found", accountStatus: "pending" };
  const r = await call({ action: "legal_accept", documentIds: [D_TERMS] });
  assert.equal(r.status, 403);
  assert.equal(r.data.error, "account_not_found");
  assert.equal(r.data.accountStatus, "pending");
  assert.equal(rpcCalls("supracore_legal_accept").length, 0);
  assert.equal(patches().length, 0);

  // and when only the accept RPC refuses
  resetFake();
  rpcAnswers.supracore_legal_outstanding = owedVakilcard;
  rpcAnswers.supracore_legal_accept = { ok: false, error: "account_not_found", accountStatus: "rejected" };
  const r2 = await call({ action: "legal_accept", documentIds: [D_TERMS, D_VC] });
  assert.equal(r2.status, 403);
  assert.equal(r2.data.accountStatus, "rejected");
  assert.equal(patches().length, 0);
});

test("legal_accept: the RPC's own errors come back with sensible statuses and detail", async () => {
  const cases = [
    [{ ok: false, error: "document_not_current", documentId: D_VC }, 409],
    [{ ok: false, error: "accept_failed", detail: "boom" }, 500],
    [{ ok: false, error: "unknown_document_id", documentId: D_VC }, 400],
    [{ ok: false, error: "product_eula_not_accepted", productId: "vakilcard" }, 400],
  ];
  for (const [answer, status] of cases) {
    resetFake();
    rpcAnswers.supracore_legal_outstanding = owedVakilcard;
    rpcAnswers.supracore_legal_accept = answer;
    const r = await call({ action: "legal_accept", documentIds: [D_VC] });
    assert.equal(r.status, status, answer.error);
    assert.deepEqual(r.data, answer, "the page gets the real answer, unmodified");
    assert.equal(patches().length, 0);
  }
});

test("legal_accept: database unreachable -> 503 unavailable, nothing stamped", async () => {
  resetFake();
  rpcAnswers.supracore_legal_outstanding = owedVakilcard;
  rpcAnswers.supracore_legal_accept = new Error("fetch failed");
  const r = await call({ action: "legal_accept", documentIds: [D_VC] });
  assert.equal(r.status, 503);
  assert.equal(r.data.error, "unavailable");
  assert.match(r.data.detail, /fetch failed/);
  assert.equal(patches().length, 0);

  resetFake();
  rpcAnswers.supracore_legal_outstanding = new Error("timeout");
  const r2 = await call({ action: "legal_accept", documentIds: [D_VC] });
  assert.equal(r2.status, 503);
  assert.equal(rpcCalls("supracore_legal_accept").length, 0);
});

test("legal_accept: malformed document ids never reach the database", async () => {
  for (const ids of [undefined, [], "x", ["not-a-uuid"], [D_TERMS, 5], new Array(21).fill(D_TERMS)]) {
    resetFake();
    const r = await call({ action: "legal_accept", documentIds: ids });
    assert.equal(r.status, 400, JSON.stringify(ids));
    assert.equal(r.data.error, "documentIds_required");
    assert.equal(calls.length, 0);
  }
  resetFake();
  const r = await call({ action: "legal_accept", documentIds: [D_TERMS], viewedDocumentIds: ["nope"] });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, "viewedDocumentIds_invalid");
  assert.equal(calls.length, 0);
});

test("redeem_courtque_beta no longer stamps anything because the browser said so", async () => {
  resetFake();
  rpcAnswers.supracore_coupon_redeem = { ok: true, plan: "TRIAL", limits: {}, expiresAt: null };
  const r = await call({ action: "redeem_courtque_beta", eula_accepted: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true, "the redeem still redeems");
  assert.equal(rpcCalls("supracore_coupon_redeem").length, 1);
  assert.equal(patches().length, 0, "no vakilpedia_accounts write at all");
});

test("the client-trusted eula_accepted flag is gone from the server and the NFC page", () => {
  const dir = path.join(__dirname, "..", "api", "vakilcard");
  for (const f of ["auth.js", "nfc.js", "_legal.js", "_consentClient.js"]) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    const code = src.replace(/\/\/[^\n]*/g, ""); // ignore comments
    assert.ok(!/eula_accepted/.test(code), f + " still mentions eula_accepted in code");
  }
  const auth = fs.readFileSync(path.join(dir, "auth.js"), "utf8");
  assert.ok(!/stampEulaAcceptance/.test(auth), "auth.js must not stamp by itself");
  const nfc = fs.readFileSync(path.join(dir, "nfc.js"), "utf8");
  assert.ok(!/type="checkbox"/.test(nfc), "no tick box on the NFC page");
});
