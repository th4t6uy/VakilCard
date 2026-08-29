// Booking payments: the Razorpay webhook, and the hole it closes.
// Run: node tests/vakilcard-booking-payments.test.js
// No network, no database: `db` is an in-memory PostgREST fake, `_razorpay` is
// stubbed, and the messaging provider is forced to `console`.
//
// WHAT THESE TESTS ENCODE (product decisions, not implementation detail):
//   1. A booking that was issued a Razorpay Payment Link can NEVER be marked
//      paid by the visitor's own say-so. Before this change, confirm_payment
//      took anyone's word for any booking.
//   2. The webhook believes Razorpay's API, never Razorpay's payload.
//   3. A redelivered webhook confirms once. Razorpay retries on any non-2xx.
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
  return rows.filter(match);
}

const libPath = path.resolve(__dirname, "../api/vakilcard/_lib.js");
const real = require(libPath);
require.cache[libPath].exports = { ...real, db: fakeDb };

/* ---------- Razorpay stub: the ONLY source of payment truth ---------- */
const rzpPath = path.resolve(__dirname, "../api/vakilcard/_razorpay.js");
const realRzp = require(rzpPath);
const rzpState = { links: {}, throwOnFetch: false };
require.cache[rzpPath].exports = {
  ...realRzp,
  configured: () => true,
  paymentsAllowed: () => true,
  verifyBookingWebhookSignature: () => true,
  async fetchPaymentLink(id) {
    if (rzpState.throwOnFetch) throw new Error("provider down");
    const l = rzpState.links[id];
    if (!l) throw new Error("no such link");
    return l;
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
const webhook = (body) =>
  call({ method: "POST", headers: { "x-razorpay-signature": "sig" }, body });

function seedBooking(overrides = {}) {
  const id = `appt-${idCounter++}`;
  const row = {
    id,
    profile_id: "prof-1",
    client_name: "Test Client",
    client_phone: "+919876543210",
    starts_at: new Date(Date.now() + 864e5).toISOString(),
    amount_inr: 500,
    payment_status: "pending",
    payment_provider: "razorpay",
    razorpay_payment_link_id: `plink_${id}`,
    razorpay_payment_id: null,
    is_pro_booking: true,
    ...overrides,
  };
  (store.vakilcard_appointment_requests || (store.vakilcard_appointment_requests = [])).push(row);
  rzpState.links[row.razorpay_payment_link_id] = {
    id: row.razorpay_payment_link_id,
    status: "paid",
    amount: 50000,
    amount_paid: 50000,
    order_id: "order_test",
    notes: { product: "vakilcard", appointment_id: id, profile_id: "prof-1" },
  };
  return row;
}
const find = (id) => store.vakilcard_appointment_requests.find((r) => r.id === id);

store.vakilcard_profiles = [
  { id: "prof-1", username: "testadvocate", full_name: "Test Advocate", account_id: null, phone: null, whatsapp: null },
];

/* ---------- tests ---------- */
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("confirm_payment cannot mark a GATEWAY booking paid — the visitor's word is not evidence", async () => {
  // THE HOLE THIS CLOSES. confirm_payment sets payment_status='claimed_paid' on
  // nothing but a request_id. Left ungated on the Razorpay path, any visitor
  // could reach a paid-looking state for a booking they never paid for -- and
  // it would look identical to the honour-system flow, where a human owner
  // still has to vouch. Prove it is refused, and prove the row did not move.
  const row = seedBooking();
  const r = await call({ method: "POST", body: { action: "confirm_payment", request_id: row.id } });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, "gateway_payment_pending");
  assert.equal(find(row.id).payment_status, "pending", "row must not move");
});

test("confirm_payment still works on the honour-system (upi://) path", async () => {
  // The guard must be narrow. Bookings with no payment link are the pre-existing
  // behaviour and must be untouched, or this change quietly breaks every
  // advocate who takes UPI directly.
  const row = seedBooking({ razorpay_payment_link_id: null, payment_provider: "upi_manual" });
  const r = await call({ method: "POST", body: { action: "confirm_payment", request_id: row.id } });
  assert.equal(r.status, 200);
  assert.equal(find(row.id).payment_status, "claimed_paid");
});

test("webhook confirms a paid link, records provenance, and is idempotent on redelivery", async () => {
  const row = seedBooking();
  const body = {
    event: "payment_link.paid",
    payload: {
      payment_link: { entity: { id: row.razorpay_payment_link_id } },
      payment: { entity: { id: "pay_test_1" } },
    },
  };
  const first = await webhook(body);
  assert.equal(first.status, 200);
  const after = find(row.id);
  assert.equal(after.payment_status, "confirmed");
  assert.equal(after.payment_provider, "razorpay", "provenance: Razorpay vouched, not the owner");
  assert.equal(after.razorpay_payment_id, "pay_test_1");
  assert.ok(after.paid_at, "paid_at must be stamped");

  // Razorpay retries on any non-2xx and can deliver twice regardless. A second
  // delivery must be a no-op that still answers 2xx, or the retries never stop.
  const second = await webhook(body);
  assert.equal(second.status, 200);
  assert.equal(second.data.idempotent, true);
});

test("webhook believes Razorpay's API, not the payload it was handed", async () => {
  // The payload claims paid; the API says the link is still unpaid. The API
  // wins. This is the whole reason the handler re-fetches -- a forged POST is
  // free to write, and a signature cannot always be checked (Vercel eats the
  // raw body), so the payload can never be the authority.
  const row = seedBooking();
  rzpState.links[row.razorpay_payment_link_id].status = "created";
  const r = await webhook({
    event: "payment_link.paid",
    payload: { payment_link: { entity: { id: row.razorpay_payment_link_id } } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.ignored, true);
  assert.equal(find(row.id).payment_status, "pending", "an unpaid link must never confirm a booking");
});

test("webhook refuses a link that belongs to a different booking", async () => {
  // notes.appointment_id points at row B while the link id belongs to row A.
  // Without the cross-check, one real payment could confirm a second booking.
  const a = seedBooking();
  const b = seedBooking();
  rzpState.links[a.razorpay_payment_link_id].notes.appointment_id = b.id;
  const r = await webhook({
    event: "payment_link.paid",
    payload: {
      payment_link: { entity: { id: a.razorpay_payment_link_id } },
      payment: { entity: { id: "pay_test_x" } },
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.reason, "link_mismatch");
  assert.equal(find(b.id).payment_status, "pending");
  assert.equal(find(a.id).payment_status, "pending");
});

test("webhook refuses an underpayment", async () => {
  const row = seedBooking();
  rzpState.links[row.razorpay_payment_link_id].amount_paid = 10000; // Rs 100 of Rs 500
  const r = await webhook({
    event: "payment_link.paid",
    payload: {
      payment_link: { entity: { id: row.razorpay_payment_link_id } },
      payment: { entity: { id: "pay_test_short" } },
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.reason, "amount_mismatch");
  assert.equal(find(row.id).payment_status, "pending");
});

test("webhook returns a RETRYABLE status when Razorpay is unreachable", async () => {
  // 2xx means "stop retrying". A provider outage must not be acknowledged as
  // handled, or a real payment is lost with no second delivery.
  const row = seedBooking();
  rzpState.throwOnFetch = true;
  try {
    const r = await webhook({
      event: "payment_link.paid",
      payload: { payment_link: { entity: { id: row.razorpay_payment_link_id } } },
    });
    assert.ok(r.status >= 500, `expected a retryable 5xx, got ${r.status}`);
  } finally {
    rzpState.throwOnFetch = false;
  }
  assert.equal(find(row.id).payment_status, "pending");
});

test("non-paid link events are acknowledged, never acted on", async () => {
  for (const event of ["payment_link.cancelled", "payment_link.expired", "payment_link.partially_paid"]) {
    const r = await webhook({ event, payload: { payment_link: { entity: { id: "plink_whatever" } } } });
    assert.equal(r.status, 200, `${event} must be acknowledged so Razorpay stops retrying`);
    assert.equal(r.data.ignored, true);
  }
});

test("the webhook branch never reaches the owner-auth gate", async () => {
  // It is dispatched on the header, above every session check. A regression
  // here would answer Razorpay with 401 and silently lose every payment.
  const r = await webhook({ event: "payment_link.paid", payload: {} });
  assert.notEqual(r.status, 401);
  assert.equal(r.status, 200);
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
