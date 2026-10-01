// The NFC activation page's consent step, driven in a fake browser (jsdom) with every network
// call faked: OTP verify -> consent card -> bind -> CourtQue offer -> consent card -> redeem.
// Run: node tests/vakilcard-nfc-consent.test.js
// Skips itself (with a message) if jsdom is not installed. No real network, no database.
process.env.VAKILPEDIA_AUTH_SECRET = "test-secret-do-not-use";

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

let JSDOM;
try {
  ({ JSDOM } = require("jsdom"));
} catch {
  console.log("SKIP: jsdom not installed");
  process.exit(0);
}

// The page handler reads the card from the database: fake just that one row.
const libPath = path.resolve(__dirname, "../api/vakilcard/_lib.js");
const real = require(libPath);
require.cache[libPath].exports = {
  ...real,
  db: async (p) => (p.startsWith("vakilcard_physical_cards") ? [{ code: "abc123", status: "unbound", account_id: null }] : []),
};
const nfc = require("../api/vakilcard/nfc.js");

const D1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const D2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const D3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DQ = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const docs = (extra) => ({
  ok: true,
  outstanding: [
    { id: D1, scope: "platform", kind: "terms", title: "Vakilpedia Terms of Service", version: "2", url: "https://account.vakilpedia.com/legal/documents/terms" },
    { id: D2, scope: "platform", kind: "privacy", title: "Vakilpedia Privacy Notice", version: "2", url: "https://account.vakilpedia.com/legal/documents/privacy" },
    { id: D3, scope: "product", productId: "vakilcard", kind: "eula", title: "VakilCard Agreement", version: "1", url: "https://account.vakilpedia.com/legal/documents/vakilcard-eula" },
  ],
  ...extra,
});
const cqDocs = () => ({
  ok: true,
  outstanding: [{ id: DQ, scope: "product", productId: "courtque", kind: "eula", title: "CourtQue Agreement", version: "1", url: "https://account.vakilpedia.com/legal/documents/courtque-eula" }],
});

async function getHtml() {
  const res = { headers: {}, setHeader() {}, end(b) { this.body = b; }, statusCode: 0 };
  await nfc({ method: "GET", query: { code: "abc123" }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  return res.body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await sleep(10);
  }
  assert.fail("timed out waiting for: " + label);
}

// Build a fake browser. `server` decides each answer: server(url, body, headers) -> {status, json}.
async function boot(server) {
  const html = await getHtml();
  const log = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://vakilcard.vakilpedia.com/nfc/abc123",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        const entry = { url: String(url), body, auth: (init.headers || {}).Authorization || null, seq: log.length };
        log.push(entry);
        const out = await server(entry);
        return { ok: out.status >= 200 && out.status < 300, status: out.status, json: async () => out.json };
      };
    },
  });
  const w = dom.window;
  const $ = (id) => w.document.getElementById(id);
  const active = () => [...w.document.querySelectorAll(".step.active")].map((e) => e.id).join(",");
  const clickText = (label) => {
    const b = [...w.document.querySelectorAll("button")].find((x) => x.textContent.trim() === label && x.offsetParent !== null || x.textContent.trim() === label);
    assert.ok(b, "no button: " + label);
    b.click();
  };
  const rootText = () => $("consent-root").textContent;
  async function signIn() {
    $("phone").value = "9876543210";
    $("btn-send").click();
    await until(() => active() === "step-otp", "otp step");
    $("otp").value = "123456";
    $("btn-verify").click();
  }
  return { w, $, log, active, clickText, rootText, signIn, close: () => w.close() };
}

const AUTH = { access_token: "AT", refresh_token: "RT", account_id: "acc" };
function baseServer(overrides = {}) {
  return async (e) => {
    if (overrides.hook) {
      const r = overrides.hook(e);
      if (r) return r;
    }
    if (e.url === "/api/vakilcard/auth") {
      switch (e.body.action) {
        case "start": return { status: 200, json: { ok: true } };
        case "verify": return { status: 200, json: { ok: true, ...AUTH } };
        case "legal_outstanding": return { status: 200, json: e.body.product === "courtque" ? cqDocs() : docs() };
        case "legal_accept": return { status: 200, json: { ok: true, consentRecordIds: ["r"], alreadyAccepted: [] } };
        case "redeem_courtque_beta": return { status: 200, json: { ok: true, plan: "TRIAL" } };
      }
    }
    if (e.url === "/api/vakilcard/nfc") return { status: 200, json: { ok: true, published: false, redirect: "https://vakilcard.vakilpedia.com" } };
    if (e.url.startsWith("https://account.vakilpedia.com/api/legal/")) {
      return { status: 200, json: { title: "Vakilpedia Terms of Service", version: "2", effectiveDate: "2026-10-01", text: "1. INTRODUCTION\n\nThese terms apply to <b>everyone</b>.\nSecond line of the same paragraph that is long enough to be reflowed into one.\n\n1.1 Scope\n\nMore text." } };
    }
    return { status: 404, json: { error: "not_found" } };
  };
}

test("happy path: card lists every document, Read/Back works, one accept, THEN bind, then CourtQue card, then redeem", async () => {
  const b = await boot(baseServer());
  try {
    assert.ok(!b.w.document.querySelector('input[type="checkbox"]'), "no tick box anywhere on the page");
    assert.ok(!b.$("btn-send").disabled, "Send code is not gated by a tick box");
    await b.signIn();
    await until(() => b.active() === "step-consent" && b.rootText().includes("Accept all & continue"), "consent card");

    const verify = b.log.find((e) => e.body && e.body.action === "verify");
    assert.ok(!("eula_accepted" in verify.body), "verify no longer carries a consent flag");

    const rows = [...b.w.document.querySelectorAll("#consent-root .cs-row")];
    assert.equal(rows.length, 3);
    assert.match(rows[0].textContent, /Vakilpedia Terms of Service/);
    assert.match(rows[2].textContent, /VakilCard Agreement/);
    assert.match(b.rootText(), /Before you continue/);
    const decline = b.w.document.querySelector("#consent-root .cs-decline a");
    assert.equal(decline.href, "https://account.vakilpedia.com/decline");
    assert.match(decline.textContent, /I don.t accept/);

    // Read -> full text in the card (rendered as text, never as HTML), then Back
    rows[0].querySelector("button").click();
    await until(() => b.rootText().includes("These terms apply to"), "agreement text");
    assert.ok(b.rootText().includes("<b>everyone</b>"), "text is shown literally, not as markup");
    assert.ok(!b.w.document.querySelector("#consent-root b"), "no markup injected from document text");
    assert.match(b.rootText(), /Version 2/);
    b.clickText("‹ Back");
    await until(() => b.w.document.querySelectorAll("#consent-root .cs-row").length === 3, "back to list");

    assert.equal(b.log.filter((e) => e.url === "/api/vakilcard/nfc").length, 0, "nothing is bound before acceptance");
    b.clickText("Accept all & continue");
    await until(() => b.active() === "step-done", "done step");

    const acc = b.log.filter((e) => e.body && e.body.action === "legal_accept");
    assert.equal(acc.length, 1, "exactly one accept call");
    assert.equal(acc[0].auth, "Bearer AT");
    assert.deepEqual(acc[0].body, { action: "legal_accept", product: "vakilcard", documentIds: [D1, D2, D3], viewedDocumentIds: [D1] });
    const bind = b.log.find((e) => e.url === "/api/vakilcard/nfc");
    assert.ok(bind.seq > acc[0].seq, "card is bound only AFTER the accept");
    assert.equal(bind.body.action, "bind");
    assert.equal(b.$("courtque-offer").style.display, "block");

    // CourtQue: same card for the CourtQue agreement, then redeem (no flag sent)
    b.$("btn-courtque").click();
    await until(() => b.active() === "step-consent" && b.rootText().includes("CourtQue Agreement"), "courtque card");
    assert.match(b.rootText(), /Before you try CourtQue/);
    assert.ok(!b.w.document.querySelector('input[type="checkbox"]'));
    assert.equal(b.log.filter((e) => e.body && e.body.action === "redeem_courtque_beta").length, 0, "not redeemed before acceptance");
    b.clickText("Accept all & continue");
    await until(() => b.log.some((e) => e.body && e.body.action === "redeem_courtque_beta"), "redeem");
    const cqAcc = b.log.filter((e) => e.body && e.body.action === "legal_accept")[1];
    assert.deepEqual(cqAcc.body, { action: "legal_accept", product: "courtque", documentIds: [DQ], viewedDocumentIds: [] });
    const redeem = b.log.find((e) => e.body && e.body.action === "redeem_courtque_beta");
    assert.deepEqual(redeem.body, { action: "redeem_courtque_beta" }, "no eula_accepted flag");
    assert.ok(redeem.seq > cqAcc.seq);
    await until(() => b.active() === "step-done" && b.$("btn-courtque").textContent.includes("activated"), "courtque done");
  } finally {
    b.close();
  }
});

test("account awaiting approval: plain message, nothing recorded, card NOT bound", async () => {
  const b = await boot(
    baseServer({
      hook: (e) =>
        e.body && e.body.action === "legal_outstanding"
          ? { status: 403, json: { ok: false, error: "account_not_found", accountStatus: "pending" } }
          : null,
    })
  );
  try {
    await b.signIn();
    await until(() => b.rootText().includes("awaiting approval"), "approval message");
    assert.match(b.rootText(), /awaiting approval — nothing was recorded/);
    assert.equal(b.active(), "step-consent");
    assert.equal(b.log.filter((e) => e.body && e.body.action === "legal_accept").length, 0);
    assert.equal(b.log.filter((e) => e.url === "/api/vakilcard/nfc").length, 0, "never bound silently");
    assert.ok(!b.w.document.querySelector("#consent-root button"), "no way to carry on");
  } finally {
    b.close();
  }
});

test("accept refused at the last moment (pending): same plain stop, nothing bound", async () => {
  const b = await boot(
    baseServer({
      hook: (e) =>
        e.body && e.body.action === "legal_accept"
          ? { status: 403, json: { ok: false, error: "account_not_found", accountStatus: "rejected" } }
          : null,
    })
  );
  try {
    await b.signIn();
    await until(() => b.rootText().includes("Accept all & continue"), "card");
    b.clickText("Accept all & continue");
    await until(() => b.rootText().includes("awaiting approval"), "stop");
    assert.equal(b.log.filter((e) => e.url === "/api/vakilcard/nfc").length, 0);
  } finally {
    b.close();
  }
});

test("a real error is shown with its code, the card stays, and nothing is bound", async () => {
  const b = await boot(
    baseServer({
      hook: (e) =>
        e.body && e.body.action === "legal_accept"
          ? { status: 409, json: { ok: false, error: "document_not_current", documentId: D3 } }
          : null,
    })
  );
  try {
    await b.signIn();
    await until(() => b.rootText().includes("Accept all & continue"), "card");
    b.clickText("Accept all & continue");
    await until(() => b.rootText().includes("document_not_current"), "error text");
    assert.match(b.rootText(), /updated while this screen was open\. Nothing was recorded/);
    assert.ok(!b.w.document.querySelector("#consent-root .cs-accept").disabled, "can try again");
    assert.equal(b.log.filter((e) => e.url === "/api/vakilcard/nfc").length, 0);
  } finally {
    b.close();
  }
});

test("nothing owed: no card, the card is bound straight away", async () => {
  const b = await boot(
    baseServer({
      hook: (e) =>
        e.body && e.body.action === "legal_outstanding" ? { status: 200, json: { ok: true, outstanding: [], satisfied: true } } : null,
    })
  );
  try {
    await b.signIn();
    await until(() => b.active() === "step-done", "done");
    assert.equal(b.log.filter((e) => e.body && e.body.action === "legal_accept").length, 0);
    assert.equal(b.log.filter((e) => e.url === "/api/vakilcard/nfc").length, 1);
  } finally {
    b.close();
  }
});

test("outstanding check unreachable: real reason + Try again, never bound", async () => {
  let fail = true;
  const b = await boot(
    baseServer({
      hook: (e) =>
        fail && e.body && e.body.action === "legal_outstanding"
          ? { status: 503, json: { ok: false, error: "unavailable", detail: "supracore_legal_outstanding: timeout" } }
          : null,
    })
  );
  try {
    await b.signIn();
    await until(() => b.rootText().includes("could not be reached"), "error");
    assert.match(b.rootText(), /timeout/);
    assert.equal(b.log.filter((e) => e.url === "/api/vakilcard/nfc").length, 0);
    fail = false;
    b.clickText("Try again");
    await until(() => b.rootText().includes("Accept all & continue"), "card after retry");
  } finally {
    b.close();
  }
});

test("optional CourtQue card has Not now (back to the done screen) and no delete-account link", async () => {
  const b = await boot(baseServer());
  try {
    await b.signIn();
    await until(() => b.rootText().includes("Accept all & continue"), "card");
    b.clickText("Accept all & continue");
    await until(() => b.active() === "step-done", "done");
    b.$("btn-courtque").click();
    await until(() => b.rootText().includes("CourtQue Agreement"), "cq card");
    assert.ok(!b.w.document.querySelector("#consent-root .cs-decline"));
    b.clickText("Not now");
    assert.equal(b.active(), "step-done");
    assert.equal(b.log.filter((e) => e.body && e.body.action === "redeem_courtque_beta").length, 0);
  } finally {
    b.close();
  }
});
