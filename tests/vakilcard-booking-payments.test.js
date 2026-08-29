// Booking under PAY-AT-APPOINTMENT.
// Run: node tests/vakilcard-booking-payments.test.js
// No network, no database: `db` is an in-memory PostgREST fake and the
// messaging provider is forced to `console`.
//
// WHAT THESE TESTS ENCODE (product decisions, not implementation detail):
//   1. A configured fee produces an appointment that is BOOKED and OWED --
//      payment_status 'due' -- and no payable link of any kind. VakilCard is
//      not in the money path and must never appear to be.
//   2. The advocate can confirm the appointment while the fee is still due.
//      The old prepaid gate made that impossible and would now deadlock every
//      fee-bearing booking.
//   3. The visitor can no longer self-report payment. `claimed_paid` on a
//      stranger's word looked like verification and was not.
//   4. The payment prefs embed arrives as an OBJECT, not an array. Getting
//      this wrong silently zeroed every fee on the platform.
//
// The nine Razorpay webhook tests that stood here until 2026-08-29 were
// removed with the flow they covered. They were correct about a design that no
// longer exists: a Payment Link put DatarOne in custody of the advocate's fee,
// which is Payment Aggregator activity and is prohibited here.
process.env.VAKILPEDIA_AUTH_SECRET = "test-secret-do-not-use";
process.env.VERIFICATION_PROVIDER = "console";

const path = require("path");
const assert = require("assert");

/* ---------- in-memory PostgREST stub ---------- */
const store = {};
let idCounter = 1;

async function fakeDb(pathq, { method = "GET", body } = {}) {
  const [table, qs = ""] = pathq.split("?");
  const rows = store[table] || (store[table] = []);
  if (method === "POST") {
    const list = Array.isArray(body) ? body : [body];
    const created = list.map((b) => ({ id: `id-${idCounter++}`, created_at: new Date().toISOString(), ...b }));
    rows.push(...created);
    return created;
  }
  const filters = [];
  for (const [k, v] of new URLSearchParams(qs)) {
    if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
    const m = /^eq\.(.*)$/.exec(v);
    if (m) filters.push({ col: k, val: m[1] });
  }
  const match = (r) => filters.every((f) => String(r[f.col]) === f.val);
  if (method === "PATCH") {
    rows.filter(match).forEach((r) => Object.assign(r, body));
    return [];
  }
  // Return COPIES. A real PostgREST read produces fresh JSON every time, and
  // loadPublicProfile does `delete p.vakilcard_payment_prefs` after unwrapping
  // -- handing back the stored object itself would let the first read strip the
  // embed out of the fixture and make the second read look like a bug in the
  // code rather than in this fake.
  return rows.filter(match).map((r) => ({ ...r }));
}

const libPath = path.resolve(__dirname, "../api/vakilcard/_lib.js");
const real = require(libPath);
require.cache[libPath].exports = { ...real, db: fakeDb };

// Force both notification channels to blow up. The contract under test is that
// a booking survives it: the appointment is already written when these run, and
// Meta, Google or Resend having a bad minute must never turn a real booking
// into an error the visitor sees.
const msgPath = path.resolve(__dirname, "../api/vakilcard/_messaging.js");
const realMsg = require(msgPath);
const notifyState = { explode: false, templateOk: false, sessionTextSent: 0 };
require.cache[msgPath].exports = {
  ...realMsg,
  async sendTemplate() {
    if (notifyState.explode) throw new Error("meta is down");
    return notifyState.templateOk ? { ok: true } : { ok: false, error: "template_missing" };
  },
  async sendText() {
    notifyState.sessionTextSent++;
    return { ok: true };
  },
};
const emailPath = path.resolve(__dirname, "../api/vakilcard/_email.js");
const realEmail = require(emailPath);
const emailState = { sent: 0, explode: false };
require.cache[emailPath].exports = {
  ...realEmail,
  configured: () => true,
  async sendEmail() {
    if (emailState.explode) throw new Error("resend is down");
    emailState.sent++;
    return { ok: true };
  },
};

const handler = require("../api/vakilcard/booking.js");

/* ---------- helpers ---------- */
function fakeRes() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; }, statusCode: 0 };
}
async function call(req) {
  const res = fakeRes();
  await handler({ headers: {}, query: {}, ...req }, res);
  return { status: res.statusCode, data: JSON.parse(res.body || "{}") };
}
const future = new Date(Date.now() + 30 * 864e5).toISOString();

store.vakilcard_profiles = [
  {
    id: "prof-fee",
    username: "feeadvocate",
    full_name: "Fee Advocate",
    account_id: null,
    phone: null,
    whatsapp: "+919876500000",
    email: "advocate@example.com",
    is_published: true,
    subscription_plan: "PRO",
    subscription_status: "ACTIVE",
    subscription_expires_at: future,
    booking_windows: null,
    // The OBJECT shape, which is what PostgREST actually returns here:
    // vakilcard_payment_prefs has PRIMARY KEY (profile_id), so the embed
    // resolves to-ONE.
    vakilcard_payment_prefs: { profile_id: "prof-fee", consultation_fee: "2000.00", upi_id: "advocate@upi" },
  },
  {
    id: "prof-free",
    username: "freeadvocate",
    full_name: "Free Advocate",
    account_id: null,
    phone: null,
    whatsapp: null,
    is_published: true,
    subscription_plan: "FREE",
    subscription_status: "ACTIVE",
    subscription_expires_at: null,
    booking_windows: null,
  },
];

const book = (username) =>
  call({
    method: "POST",
    body: {
      action: "request",
      username,
      client_name: "Test Client",
      client_phone: "+919876543210",
      start: new Date(Date.now() + 2 * 864e5).toISOString(),
      end: new Date(Date.now() + 2 * 864e5 + 18e5).toISOString(),
    },
  });
const rowFor = (pid) => store.vakilcard_appointment_requests.find((x) => x.profile_id === pid);

/* ---------- tests ---------- */
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("a configured fee books the slot and records it as DUE, collecting nothing", async () => {
  const r = await book("feeadvocate");
  assert.equal(r.status, 200);
  assert.equal(r.data.payment_status, "due", "a fee that exists must be recorded as owed");
  assert.equal(r.data.amount_due, 2000);

  // The whole point: VakilCard is not in the money path, so it must not hand
  // the visitor anything that looks like a way to pay through us.
  assert.equal(r.data.pay_link, undefined, "no upi:// link may be issued by booking");
  assert.equal(r.data.pay_url, undefined, "no gateway link may be issued by booking");

  const row = rowFor("prof-fee");
  assert.ok(row, "the appointment must exist");
  assert.equal(row.payment_status, "due");
  assert.equal(Number(row.amount_inr), 2000);
  assert.ok(!row.razorpay_payment_link_id, "nothing may be written to the dormant gateway columns");
});

test("the to-ONE payment_prefs embed is unwrapped — the bug that zeroed every fee", async () => {
  // vakilcard_payment_prefs has PRIMARY KEY (profile_id), so PostgREST returns
  // the embed as a single OBJECT. booking.js unwrapped only the array shape and
  // mapped the object to null, so profile.payment was always null: the fee read
  // as unset and every booking looked free. _lib.js:361 has handled both shapes
  // all along, which is why the SSR card displayed a fee the booking sheet
  // insisted did not exist.
  const r = await call({ method: "GET", query: { action: "public_slots", username: "feeadvocate" } });
  assert.equal(r.status, 200);
  assert.equal(r.data.payment.amount_due, 2000, "the fee must survive the to-one embed");
  assert.equal(r.data.payment.required, false, "nothing is ever required up front");
});

test("no fee configured still books, and owes nothing", async () => {
  const r = await book("freeadvocate");
  assert.equal(r.status, 200);
  assert.equal(r.data.payment_status, "not_required");
  assert.equal(r.data.amount_due, null);
  assert.equal(rowFor("prof-free").payment_status, "not_required");
});

test("the visitor can no longer self-report payment, and cannot move a row", async () => {
  // 'claimed_paid' was written on nothing but a tap. It read as verified to
  // every screen that consumed it.
  const row = rowFor("prof-fee");
  const before = row.payment_status;
  const r = await call({ method: "POST", body: { action: "confirm_payment", request_id: row.id } });
  assert.equal(r.status, 410, "the endpoint must answer, not fall through to the owner-auth 401");
  assert.equal(r.data.error, "payment_confirmation_retired");
  assert.equal(rowFor("prof-fee").payment_status, before, "the row must not move");
});

test("booking.js still dispatches `action` from the POST body", async () => {
  // Guards 37d4e5c. Query-only dispatch made every POST branch unreachable and
  // presented as a session error. "request" with no username 404s before it
  // touches the database, so 404 means dispatched and 401 means it fell through.
  const viaBody = await call({ method: "POST", body: { action: "request" } });
  assert.equal(viaBody.status, 404);
  const viaQuery = await call({ method: "POST", query: { action: "request" }, body: {} });
  assert.equal(viaQuery.status, 404);
  const unknown = await call({ method: "POST", body: { action: "definitely_not_an_action" } });
  assert.equal(unknown.status, 401);
});

test("an unapproved WhatsApp template falls back to session text, and email still goes", async () => {
  // THE 2026-08-29 FAILURE. message_templates rows are our registry, not a Meta
  // approval: vakilcard_booking_alert was inactive, sendTemplate returned
  // template_missing, and the advocate heard NOTHING against three real
  // bookings. Silence is the one outcome that must not happen.
  notifyState.templateOk = false;
  notifyState.sessionTextSent = 0;
  emailState.sent = 0;
  const r = await book("feeadvocate");
  assert.equal(r.status, 200);
  // NO tick is yielded here ON PURPOSE. The assertions run immediately after
  // the handler resolves, so they only pass if the notifications were AWAITED
  // before the response. Floating them would let Vercel freeze the instance
  // mid-flight and drop them -- which is exactly what happened in production
  // on 2026-08-29: the appointment INSERT logged its 201 and the three calls
  // after it logged a request with no response.
  assert.equal(notifyState.sessionTextSent, 1, "a refused template must fall back to session text");
  assert.equal(emailState.sent, 1, "email is an independent channel and must still fire");
});

test("a booking survives every notification channel throwing", async () => {
  // The row is written before any of this runs, and nothing downstream may
  // surface as an error to the visitor.
  //
  // HONEST NOTE ON WHAT THIS PROVES. Containment here is TWO layers: the
  // per-channel try/catch inside notifyOwnerOfBooking, and the .catch() on the
  // fire-and-forget call. Removing either one alone still passes this test,
  // because the other still holds -- so do not read a pass as evidence that
  // both are load-bearing. Removing BOTH fails it. The second layer is kept
  // regardless: an unhandled rejection from a floating promise is a lambda
  // crash, not a logged warning.
  notifyState.explode = true;
  emailState.explode = true;
  try {
    const r = await book("feeadvocate");
    assert.equal(r.status, 200, "notification failure must never break a booking");
    assert.equal(r.data.payment_status, "due");
  } finally {
    notifyState.explode = false;
    emailState.explode = false;
  }
});

test("the advocate's email address is actually loaded, or no email can ever be sent", async () => {
  // THE 2026-08-29 BUG. loadPublicProfile's select did not request `email`, so
  // profile.email was undefined, the send branch never ran, and sendEmail --
  // which logs even when unconfigured -- never got the chance to log a reason.
  // The failure was invisible: no error, no row, nothing to grep for. Assert on
  // the select itself, because that is where the omission lives.
  const src = require("fs").readFileSync(
    path.resolve(__dirname, "../api/vakilcard/booking.js"),
    "utf8"
  );
  // Anchor on vakilcard_payment_prefs: booking.js has TWO profile selects, and
  // loadOwnerProfile's (the authed owner path) legitimately does not need
  // email. Only loadPublicProfile embeds the payment prefs, so that is the one
  // the visitor-facing notifier actually reads.
  const sel = /&select=([^`]*vakilcard_payment_prefs[^`]*)/.exec(src);
  assert.ok(sel, "loadPublicProfile's select must be findable");
  const cols = sel[1].split(",").map((c) => c.trim());
  for (const needed of ["email", "whatsapp", "phone", "account_id", "username"]) {
    assert.ok(
      cols.includes(needed),
      `loadPublicProfile must select '${needed}' — the notifier reads it and fails silently without it`
    );
  }
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
