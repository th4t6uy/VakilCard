// VakilCard appointment booking.
//   Free : fixed weekly windows, one-way requests, no calendar check, no
//          payment — overlapping placeholders are documented behaviour.
//   Pro  : same windows PLUS Google Calendar free/busy cross-check (no
//          double-booking), and payment-before-confirmation for two booking
//          types — "consultation" (owner's configured fee) or "custom"
//          (visitor-entered amount) — via a native UPI deep link.
//
// "booking" in PRO_FEATURES gates only the Pro upgrade (calendar sync +
// payment). Fixed-window booking itself is Free-tier from day one — see
// me.js's booking_windows field (no entitlement guard there) and the
// GENERAL RULES in the product spec ("Free = fixed windows... no payment").
//
// Endpoints (all on this one handler, disambiguated by method + action):
//   GET  ?action=config                      owner auth  — windows, requests, calendar status
//   GET  ?action=public_slots&username=..    no auth     — bookable slots for a published profile
//   POST {action:"save_windows", windows}    owner auth  — persist weekly availability
//   POST {action:"request", ...}             no auth     — visitor requests a slot
//   POST {action:"confirm_payment", id}      no auth     — visitor self-reports "I've paid"
//   POST {action:"manage", id, op, ...}      owner auth  — confirm/decline/complete a request
//   POST + x-razorpay-signature header       provider    — Razorpay booking webhook
//
// TWO PAYMENT PATHS, and the difference is who vouches for the money:
//
//   upi:// deep link (payment_provider 'upi_manual') — the honour system. A
//     upi:// link has no gateway behind it and therefore no webhook: the
//     visitor self-reports ("claimed_paid") and the OWNER confirms receipt
//     ("confirmed"). This is never faked as automatic verification. It remains
//     the behaviour whenever Razorpay is unconfigured or payments are gated off.
//
//   Razorpay Payment Link (payment_provider 'razorpay') — verified money. The
//     visitor pays on a Razorpay-hosted page; a webhook confirms the booking
//     with no human in the loop. Enabled only when Razorpay is configured AND
//     PAYMENTS_ENABLED is true (the DatarOne incorporation gate in
//     _razorpay.js). Fails CLOSED: anything missing degrades to the upi:// path
//     above, never to a dead end and never to an unverified confirmation.
//
// A booking created on the Razorpay path can NEVER be confirmed by the visitor's
// word — see the guard in confirm_payment.
const { db, readJsonBody, resolveAccount, trackEvent, sanitizeBookingWindows, expandBookingSlots } = require("./_lib");
const { isProActive, requirePro } = require("./_entitlements");
const { sign, verify } = require("./_jwt");
const rzp = require("./_razorpay");
const messaging = require("./_messaging");

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

// 2026-08-16 fix batch: root cause of "appointment button slow / connect
// fails silently" — none of this file's Google API calls had a timeout, so
// a slow (not erroring) Google response left the whole booking request
// hanging indefinitely instead of degrading to windows-only/fallback as the
// surrounding comments already claimed. This wraps fetch() with an
// AbortController-based deadline; callers keep their existing try/catch
// (a timeout just throws like any other fetch failure) so no call site
// needs to change its error handling.
async function fetchWithTimeout(url, opts = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Google Calendar (Pro's "Smart" booking) — folded into this file rather than
// its own api/vakilcard/calendar.js endpoint: Vercel's Hobby plan caps a
// deployment at 12 Serverless Functions, and this project already sits at
// that ceiling. A standalone calendar.js was the 13th function and broke
// production ("No more than 12 Serverless Functions..."). Every other
// multi-action concern in this API (auth, admin, account) already lives in
// one file dispatched by `action` — this follows the same convention.
//
// INERT BY DEFAULT: every branch below 503s with a clear message until
// GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI
// are set. No fake/simulated connection is ever created.
const GCAL_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const GCAL_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const GCAL_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || "";
const GCAL_DASHBOARD_SITE = process.env.VAKILCARD_DASHBOARD_URL || "https://vakilcard.vakilpedia.com";
// 2026-08-29: calendar.events, NOT calendar.freebusy. This is a deliberate
// trade the founder made with the facts in front of him, and the reasoning
// matters more than the constant.
//
// The Google Cloud project (caselinx-500307) is verified and in production,
// and the sensitive scope it has APPROVED is calendar.events. calendar.freebusy
// was never registered on the consent screen at all. Requesting an unregistered
// sensitive scope is exactly the condition Google's Audience page describes:
// users see the "unverified app" screen and the project's 100-user cap applies
// to them. So the narrower scope was not buying privacy in practice -- it was
// buying a hard ceiling at 100 advocates, on the one feature meant to scale.
//
// Switching to the already-approved scope removes the cap today, with no new
// verification round, and it is also what lets a future booking write the
// appointment INTO the advocate's calendar.
//
// 🔴 THE COST, AND THE OBLIGATION IT CREATES. calendar.events grants read AND
// WRITE on every event in every calendar the advocate owns. That is far more
// than this app uses: the only call made today is freeBusy(), which returns
// busy time ranges and no event contents. But we now HOLD the broader
// permission, so no user-facing copy may claim we cannot see their appointments.
// It said exactly that until today. The dashboard copy and the privacy policy
// were rewritten in the same commit to separate what Google GRANTS from what
// VakilCard USES. If that distinction ever stops being stated plainly, this
// scope choice stops being defensible -- these are advocates, and their diaries
// are privileged.
//
// Existing connections are unaffected: tokens already granted for freebusy keep
// satisfying freeBusy() calls. They simply will not carry write access until
// the owner reconnects, which nothing needs yet.
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
// 2026-08-26: business.manage (Google Business Profile) is NO LONGER REQUESTED.
// It is a SENSITIVE Google scope, it was bundled into the same consent screen as
// Calendar free/busy -- so anyone who wanted booking availability was also asked
// to hand over Business Profile management -- and
// public.vakilcard_google_business_connections had ZERO rows, i.e. nobody had
// ever used it. Least privilege says drop an unused sensitive scope rather than
// write a disclosure for it; doing so also removes it from Google verification.
// The Business Profile TILE on the card is unaffected: that runs on a link the
// owner pastes in (vakilcard_profiles.google_business_url), which needs no scope.
// Calendar consent is now requested only when the owner connects their calendar.

function calendarConfigured() {
  return !!(GCAL_CLIENT_ID && GCAL_CLIENT_SECRET && GCAL_REDIRECT_URI);
}

// ---------------------------------------------------------------------------
// Google Business linking, via the PLACES API — one tap, no OAuth.
//
// The advocate types their chamber name, taps their listing, and it is linked.
// No URL to find, copy or paste. Founder, 29 Aug 2026: "we sell convenience to
// users" — a non-technical advocate will not go and fetch a Maps URL, and a
// feature they cannot reach is a feature that does not exist.
//
// WHY NOT THE BUSINESS PROFILE API. business.manage is a sensitive scope
// behind a manual Google approval gate (Organization account, a profile
// verified 60+ days, an access-request form, and a 0-QPM quota until they say
// yes). It is also the wrong tool: it exists to MANAGE a listing you own. We
// only need to SHOW a public listing and deep-link to its review form, which
// Places does with an API key alone.
//
// Places also returns what OAuth never gave us: `rating` and `userRatingCount`
// — which the card component has always been able to render and nothing could
// ever supply — and `googleMapsLinks.writeAReviewUri`, the REAL review deep
// link. The old code built a fake one by string-matching a Maps CID.
//
// INERT BY DEFAULT, like the calendar block above: with no key set, the
// branches 503 with a clear message. Nothing is faked.
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const PLACES_BASE = "https://places.googleapis.com/v1";

function placesConfigured() {
  return !!PLACES_KEY;
}

/**
 * The field mask is a BILLING DECISION, not a formality — Places charges by
 * the most expensive SKU any requested field belongs to:
 *   formattedAddress ................................ Essentials
 *   id, displayName, googleMapsLinks ................ Pro
 *   rating, userRatingCount ......................... Enterprise
 * We take the Enterprise hit exactly ONCE, when the owner links or relinks,
 * and cache every value on their profile row. A public card is opened by
 * visitors and must never trigger a Places call; see api/vakilcard/profile.js,
 * which reads only the cached columns.
 */
const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "googleMapsLinks",
].join(",");

async function placesFetch(path, { method = "GET", body, fieldMask } = {}) {
  const r = await fetchWithTimeout(
    `${PLACES_BASE}${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    8000
  );
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!r.ok) {
    // Never log the key, and never hand Google's raw error to the client — it
    // can name the project and the enabled APIs.
    console.error(`[vakilcard/places] ${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
    return { ok: false, status: r.status, data };
  }
  return { ok: true, status: r.status, data };
}

function notConfigured(res) {
  return json(res, 503, {
    error: "calendar_not_configured",
    message: "Google Calendar isn't set up on this deployment yet. Contact the founder to enable it.",
  });
}

async function gcalExchangeCode(code) {
  const r = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GCAL_CLIENT_ID,
      client_secret: GCAL_CLIENT_SECRET,
      redirect_uri: GCAL_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || "token_exchange_failed");
  return data;
}

async function gcalRefreshAccessToken(refreshToken) {
  const r = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GCAL_CLIENT_ID,
      client_secret: GCAL_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || "token_refresh_failed");
  return data;
}

/** Valid access token for a profile's stored connection, or null if not
 *  connected. Refreshes + persists when expired. Never throws — a Google
 *  outage degrades to windows-only availability, never a broken booking page. */
async function gcalValidAccessToken(profileId) {
  if (!calendarConfigured()) return null;
  const rows = await db(`vakilcard_calendar_connections?profile_id=eq.${profileId}&select=*`);
  const conn = rows[0];
  if (!conn) return null;
  if (new Date(conn.token_expires_at).getTime() > Date.now() + 60000) return conn.access_token;
  if (!conn.refresh_token) return null;
  try {
    const t = await gcalRefreshAccessToken(conn.refresh_token);
    const expires_at = new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString();
    await db(`vakilcard_calendar_connections?profile_id=eq.${profileId}`, {
      method: "PATCH",
      body: { access_token: t.access_token, token_expires_at: expires_at },
      prefer: "return=minimal",
    });
    return t.access_token;
  } catch {
    return null;
  }
}

/** Free/busy ranges for the next `days` days, or [] on any failure/absence
 *  — treated identically to "not connected" (windows-only). */
async function freeBusy(profileId, { days = 14 } = {}) {
  const token = await gcalValidAccessToken(profileId);
  if (!token) return [];
  const rows = await db(`vakilcard_calendar_connections?profile_id=eq.${profileId}&select=calendar_id`);
  const calendarId = (rows[0] && rows[0].calendar_id) || "primary";
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86400000).toISOString();
  try {
    const r = await fetchWithTimeout("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
    });
    const data = await r.json();
    if (!r.ok) return [];
    const busy = (data.calendars && data.calendars[calendarId] && data.calendars[calendarId].busy) || [];
    return busy.map((b) => ({ start: b.start, end: b.end }));
  } catch {
    return [];
  }
}

// "gcal_start" is reached via a plain top-level browser navigation (the
// OAuth consent redirect can't be triggered from a fetch() with a custom
// Authorization header), so it accepts the access token as a query param
// too — a one-time GET the owner triggers themselves. Every other action
// on this handler stays header-only.
async function resolveAccountForGcalStart(req) {
  const viaHeader = await resolveAccount(req);
  if (viaHeader) return viaHeader;
  const token = String(req.query.token || "");
  if (!token) return null;
  const claims = verify(token);
  return claims && claims.sub ? { accountId: claims.sub } : null;
}

const str = (v, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

async function loadOwnerProfile(req) {
  const who = await resolveAccount(req);
  if (!who || !who.accountId) return { error: 401 };
  const rows = await db(
    `vakilcard_profiles?account_id=eq.${who.accountId}&select=id,subscription_plan,subscription_status,subscription_expires_at,booking_windows`
  );
  const profile = rows[0];
  if (!profile) return { error: 404 };
  return { profile };
}

/** Load a PUBLISHED profile by username for visitor-facing (no-auth) actions. */
async function loadPublicProfile(username) {
  const uname = String(username || "").toLowerCase();
  if (!uname) return null;
  const rows = await db(
    `vakilcard_profiles?username=eq.${encodeURIComponent(uname)}&is_published=eq.true` +
      `&select=id,username,full_name,account_id,phone,whatsapp,subscription_plan,subscription_status,subscription_expires_at,booking_windows,vakilcard_payment_prefs(*)`
  );
  const p = rows[0];
  if (!p) return null;
  p.payment = Array.isArray(p.vakilcard_payment_prefs) ? p.vakilcard_payment_prefs[0] || null : null;
  delete p.vakilcard_payment_prefs;
  return p;
}

/** Stores a Calendar connection for `pid` from an already-exchanged token
 *  response `t`. Returns { ok, reason }. Never throws — a Google outage or
 *  missing refresh_token degrades to "not connected", never a crash. */
async function storeCalendarConnection(pid, t) {
  if (!t.refresh_token) return { ok: false, reason: "no_refresh_token_reconnect_required" };
  try {
    const expires_at = new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString();
    await db("vakilcard_calendar_connections?on_conflict=profile_id", {
      method: "POST",
      body: {
        profile_id: pid,
        provider: "google",
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        token_expires_at: expires_at,
        calendar_id: "primary",
      },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    return { ok: true };
  } catch (e) {
    // 2026-08-16: this used to swallow the real error completely — a
    // profile-store failure here was indistinguishable in Vercel logs from
    // a Google outage. Log it (db() already logs its own request/response,
    // so this mainly catches non-db throws) so a support/diagnosis pass
    // doesn't have to reproduce the failure blind.
    console.error(`[vakilcard/booking] storeCalendarConnection pid=${pid} failed:`, e && (e.message || e));
    return { ok: false, reason: "exchange_failed" };
  }
}


// ---------------------------------------------------------------------------
// Advocate notification (WhatsApp) — the booking's only push to the owner.
//
// NOTHING here may break a booking. A client who has paid is booked whether or
// not Meta accepted our template; the dashboard is the source of truth and this
// is the nudge that stops the advocate having to watch it. Every failure path
// therefore returns quietly — MessagingService already writes a 'skipped' or
// 'failed' row to message_log with the reason, so a missing template approval
// is visible there instead of silent.

/** Best phone for the OWNER: the verified account identity first (that is the
 *  number they proved they control at signup), then the card's own fields. */
async function ownerPhone(profile) {
  if (profile && profile.account_id) {
    try {
      const rows = await db(
        `account_phone_identities?account_id=eq.${profile.account_id}` +
          `&select=phone_e164,is_primary,verified_at&order=is_primary.desc,verified_at.desc.nullslast&limit=1`
      );
      if (rows[0] && rows[0].phone_e164) return rows[0].phone_e164;
    } catch {
      /* fall through to the card's own contact fields */
    }
  }
  return (profile && (profile.whatsapp || profile.phone)) || null;
}

/** "Tue, 2 Sep 2026, 4:30 pm" in IST — the advocate's timezone, always, no
 *  matter what timezone the serverless region happens to run in. */
function formatSlotIST(startsAt) {
  const d = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (isNaN(d.getTime())) return "the requested time";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Tell the advocate a client booked. `paid` distinguishes the two things they
 * actually need to know apart: money has landed, versus someone has asked for
 * a slot and nothing has been paid.
 */
async function notifyOwnerOfBooking(profile, appointment, { paid = false } = {}) {
  try {
    const phone = await ownerPhone(profile);
    if (!phone) return;
    const amount = Number(appointment.amount_inr);
    const paymentLine = paid
      ? `Payment received: Rs ${amount}`
      : amount
        ? `Payment pending: Rs ${amount}`
        : "No payment required";
    const dashboard = `${GCAL_DASHBOARD_SITE}/${profile.username || ""}/dashboard`;
    await messaging.sendTemplate({
      product: "vakilcard",
      module: "notification",
      templateName: "vakilcard_booking_alert",
      phoneE164: phone,
      accountId: profile.account_id || null,
      bodyParams: [
        appointment.client_name || "A client",
        formatSlotIST(appointment.starts_at),
        paymentLine,
        dashboard,
      ],
    });
  } catch (e) {
    // Never rethrow into a booking or a webhook response.
    console.error("[vakilcard/booking] owner notification failed:", e && (e.message || e));
  }
}

// ---------------------------------------------------------------------------
// Razorpay booking webhook.
//
// Modelled on subscription.js's handleWebhook, deliberately, including the two
// disciplines that matter most:
//
//   1. THE PAYLOAD IS NEVER THE AUTHORITY. We take ids out of it and re-fetch
//      the payment link from Razorpay's API. Vercel pre-parses JSON bodies,
//      which destroys the raw bytes the HMAC is computed over, so signature
//      verification is best-effort by construction — but a forger cannot make
//      Razorpay's own API report a link as paid, which is what we act on.
//      Whether the signature could be checked is recorded, never assumed.
//   2. IDEMPOTENCY BEFORE MUTATION. Razorpay retries on any non-2xx and two
//      invocations can run at once; the unique index on razorpay_payment_id is
//      the backstop, this check is the polite path.
//
// Status codes are part of the contract: 2xx means "stop retrying" (including
// for events we deliberately ignore), non-2xx means "retry, this was transient".
async function handleBookingWebhook(req, res, body, rawBody) {
  const signature = req.headers["x-razorpay-signature"];
  const signatureOk = rawBody ? rzp.verifyBookingWebhookSignature(rawBody, signature) : false;

  const event = body && body.event;
  const payload = (body && body.payload) || {};
  const linkEntity = payload.payment_link && payload.payment_link.entity;
  const payEntity = payload.payment && payload.payment.entity;
  const linkId = linkEntity && linkEntity.id;

  // Only the paid event moves money-state. cancelled/expired/partially_paid are
  // acknowledged so Razorpay stops retrying; the appointment simply stays
  // unpaid and the slot stays unconfirmed, which is already the correct state.
  if (event !== "payment_link.paid" || !linkId) {
    return json(res, 200, { ok: true, ignored: true, event: event || null });
  }
  if (!rzp.configured()) {
    // Cannot re-fetch, therefore cannot verify, therefore will not act.
    console.error("[vakilcard/booking] webhook received but Razorpay is not configured");
    return json(res, 503, { error: "razorpay_not_configured" });
  }

  let link;
  try {
    link = await rzp.fetchPaymentLink(linkId);
  } catch (e) {
    console.error("[vakilcard/booking] webhook payment_link fetch failed:", e && e.message);
    return json(res, 502, { error: "provider_unreachable" });
  }
  if (!link || link.status !== "paid") {
    return json(res, 200, { ok: true, ignored: true, reason: "link_not_paid" });
  }

  const notes = link.notes || {};
  if (notes.product !== "vakilcard" || !notes.appointment_id) {
    return json(res, 200, { ok: true, ignored: true, reason: "not_a_vakilcard_booking" });
  }

  const rows = await db(
    `vakilcard_appointment_requests?id=eq.${encodeURIComponent(notes.appointment_id)}&select=*`
  );
  const appt = rows[0];
  if (!appt) return json(res, 200, { ok: true, ignored: true, reason: "appointment_not_found" });

  // The link must be the one THIS row was issued. A leaked or replayed link id
  // from another booking must not confirm this one.
  if (appt.razorpay_payment_link_id !== linkId) {
    console.error(
      `[vakilcard/booking] webhook link mismatch appt=${appt.id} expected=${appt.razorpay_payment_link_id} got=${linkId}`
    );
    return json(res, 200, { ok: true, ignored: true, reason: "link_mismatch" });
  }

  if (appt.razorpay_payment_id) {
    return json(res, 200, { ok: true, idempotent: true });
  }

  // Underpayment cannot confirm. accept_partial is false at creation, so this
  // is a belt-and-braces check against a link edited in the dashboard.
  const expectedPaise = Math.round(Number(appt.amount_inr || 0) * 100);
  const paidPaise = Number(link.amount_paid || 0);
  if (expectedPaise > 0 && paidPaise < expectedPaise) {
    console.error(`[vakilcard/booking] underpayment appt=${appt.id} paid=${paidPaise} expected=${expectedPaise}`);
    return json(res, 200, { ok: true, ignored: true, reason: "amount_mismatch" });
  }

  const paymentId =
    (payEntity && payEntity.id) ||
    (Array.isArray(link.payments) && link.payments.find((p) => p.status === "captured")?.payment_id) ||
    null;

  try {
    await db(`vakilcard_appointment_requests?id=eq.${encodeURIComponent(appt.id)}`, {
      method: "PATCH",
      body: {
        payment_status: "confirmed",
        payment_provider: "razorpay",
        razorpay_payment_id: paymentId,
        razorpay_order_id: (link.order_id) || null,
        paid_at: new Date().toISOString(),
      },
      prefer: "return=minimal",
    });
  } catch (e) {
    // The unique index on razorpay_payment_id rejecting a concurrent duplicate
    // is SUCCESS, not failure: the other invocation already confirmed this row.
    const msg = String((e && e.message) || "");
    if (/duplicate key|uq_vakilcard_appt_rzp_payment|23505/i.test(msg)) {
      return json(res, 200, { ok: true, idempotent: true });
    }
    console.error("[vakilcard/booking] webhook confirm write failed:", msg);
    return json(res, 500, { error: "confirm_failed" });
  }

  trackEvent(appt.profile_id, "pay", null).catch(() => {});

  // Notification needs the owner's contact fields, which the appointment row
  // does not carry.
  try {
    const owner = (
      await db(
        `vakilcard_profiles?id=eq.${appt.profile_id}&select=id,username,full_name,account_id,phone,whatsapp`
      )
    )[0];
    if (owner) await notifyOwnerOfBooking(owner, appt, { paid: true });
  } catch (e) {
    console.error("[vakilcard/booking] webhook notify lookup failed:", e && (e.message || e));
  }

  console.log(
    `[vakilcard/booking] payment confirmed appt=${appt.id} link=${linkId} payment=${paymentId} signature_verified=${signatureOk}`
  );
  return json(res, 200, { ok: true, appointment_id: appt.id });
}

function upiDeepLink({ upiId, name, amountInr, note }) {
  if (!upiId) return null;
  const params = new URLSearchParams({
    pa: upiId,
    pn: str(name, 60) || "VakilCard",
    cu: "INR",
    tn: str(note, 60) || "VakilCard appointment",
  });
  if (amountInr != null) params.set("am", String(amountInr));
  return `upi://pay?${params.toString()}`;
}

module.exports = async function handler(req, res) {
  try {
    // `action` must be readable from the QUERY STRING **or** the POST BODY.
    //
    // It was query-only from f10f1a5 until 2026-08-29, and EVERY client in the
    // estate sends it in the body, so every POST branch in this file was
    // unreachable in production. Not a subtle degradation -- the requests fell
    // past all of them to the owner-auth check at the bottom and came back
    // "unauthenticated", which reads like a session problem and is why it
    // survived this long. Proven against the live deployment:
    //   POST {"action":"request"}      -> 401  (ignored, fell through)
    //   POST ?action=request           -> 404  (dispatched correctly)
    //
    // What was silently dead: save_windows (Save availability), manage
    // (accept/decline a request), gcal_disconnect (Disconnect Calendar), and
    // -- worst -- `request` and `confirm_payment`, which the PUBLIC card posts
    // from mount.js:807/848. No visitor has ever been able to book an
    // appointment. "No requests yet" on the dashboard was not a quiet product;
    // it was an endpoint nobody could reach.
    //
    // The body is parsed once here and cached on req, so the downstream
    // readJsonBody(req) calls return it rather than re-reading a consumed
    // stream (see its first line in _lib.js). Vercel usually pre-parses
    // req.body for JSON content-types; this works whether it did or not.
    //
    // rawBody is captured HERE and nowhere else. The Razorpay webhook's HMAC is
    // computed over the exact bytes, and reading the stream is a one-shot
    // operation -- readJsonBody() would consume it and leave nothing to hash.
    // When the platform has already parsed req.body the bytes are gone before
    // this function runs; handleBookingWebhook is built to be correct without
    // them (it re-fetches from Razorpay rather than trusting the payload).
    let rawBody = null;
    if (req.method === "POST" && (!req.body || typeof req.body !== "object")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      rawBody = Buffer.concat(chunks).toString("utf8");
      try {
        req.body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        req.body = {};
      }
    }
    const action = String(
      req.query.action || (req.body && typeof req.body === "object" && req.body.action) || ""
    );

    // ---- Razorpay booking webhook — provider-authed by signature, never by a
    // session, and dispatched on the HEADER rather than an `action` because
    // Razorpay controls the request body, not us. Same detection as
    // subscription.js. Must stay ABOVE every owner-auth branch.
    if (req.method === "POST" && req.headers["x-razorpay-signature"]) {
      return handleBookingWebhook(req, res, req.body || {}, rawBody);
    }

    // ---- GET ?action=gcal_start — owner auth (header or query token), Pro
    if (req.method === "GET" && action === "gcal_start") {
      if (!calendarConfigured()) return notConfigured(res);
      const who = await resolveAccountForGcalStart(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const rows = await db(
        `vakilcard_profiles?account_id=eq.${who.accountId}&select=id,subscription_plan,subscription_status,subscription_expires_at`
      );
      const gprofile = rows[0];
      if (!gprofile) return json(res, 404, { error: "no_profile" });
      if (!requirePro(res, gprofile, "booking")) return;
      const state = sign({ pid: gprofile.id, typ: "gcal_state" }, { expiresInSec: 600 });
      const url =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: GCAL_CLIENT_ID,
          redirect_uri: GCAL_REDIRECT_URI,
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          scope: GCAL_SCOPE,
          state,
        });
      res.statusCode = 302;
      res.setHeader("Location", url);
      res.end();
      return;
    }


    // ---- GET ?action=google_connect_start — owner auth, Pro. THE primary
    // dashboard CTA. Since 2026-08-26 it requests a CALENDAR scope only --
    // Business Profile management is no longer bundled in. See GCAL_SCOPE above
    // for why that scope is calendar.events rather than the narrower
    // calendar.freebusy. requirePro's `feature` label is informational only
    // (never validated against PRO_FEATURES — see _entitlements.js).
    if (req.method === "GET" && action === "google_connect_start") {
      if (!calendarConfigured()) return notConfigured(res);
      const who = await resolveAccountForGcalStart(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const rows = await db(
        `vakilcard_profiles?account_id=eq.${who.accountId}&select=id,subscription_plan,subscription_status,subscription_expires_at`
      );
      const gprofile = rows[0];
      if (!gprofile) return json(res, 404, { error: "no_profile" });
      if (!requirePro(res, gprofile, "booking")) return;
      const state = sign({ pid: gprofile.id, typ: "gcal_business_state" }, { expiresInSec: 600 });
      const url =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: GCAL_CLIENT_ID,
          redirect_uri: GCAL_REDIRECT_URI,
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          scope: GCAL_SCOPE,
          state,
        });
      res.statusCode = 302;
      res.setHeader("Location", url);
      res.end();
      return;
    }

    // ---- GET ?action=gcal_callback — Google's own redirect, no auth ------
    // Shared by all three connect flows (calendar-only, business-only, and
    // the combined primary flow) — `claims.typ` picks the branch, and the
    // combined branch just calls both storage helpers off the one token.
    if (req.method === "GET" && action === "gcal_callback") {
      if (!calendarConfigured()) return notConfigured(res);
      let claims;
      try {
        claims = verify(String(req.query.state || ""));
      } catch (e) {
        claims = null;
      }
      const typ = claims && claims.typ;
      const kind = typ === "gcal_business_state" ? "google" : "gcal";
      let username = null;
      if (claims && claims.pid) {
        try {
          const profileRows = await db(`vakilcard_profiles?id=eq.${claims.pid}&select=username`);
          username = profileRows[0]?.username || null;
        } catch (dbErr) {}
      }
      const redirectBack = (ok, msg) => {
        res.statusCode = 302;
        const page = username ? `${username}/dashboard` : "setup";
        const search = `?s=payment&${kind}=${ok ? "connected" : "error"}${msg ? "&msg=" + encodeURIComponent(msg) : ""}`;
        res.setHeader("Location", `${GCAL_DASHBOARD_SITE}/${page}${search}`);
        res.end();
      };
      if (!claims || !claims.pid || !["gcal_state", "gcal_business_state"].includes(typ)) {
        return redirectBack(false, "expired_state");
      }
      const code = String(req.query.code || "");
      if (!code) return redirectBack(false, req.query.error || "no_code");

      let t;
      try {
        t = await gcalExchangeCode(code);
      } catch (e) {
        return redirectBack(false, "exchange_failed");
      }

      // Both state types now mean the same thing: a Calendar free/busy
      // connection. gcal_business_state is still accepted because a state signed
      // before this change may be in flight (10-minute expiry), and bouncing
      // that user with "expired_state" would be a needless failure.
      const r = await storeCalendarConnection(claims.pid, t);
      return redirectBack(r.ok, r.ok ? null : r.reason);
    }

    // ---- POST {action:"gcal_disconnect"} — owner auth --------------------
    if (req.method === "POST" && action === "gcal_disconnect") {
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const rows = await db(`vakilcard_profiles?account_id=eq.${who.accountId}&select=id`);
      const gprofile = rows[0];
      if (!gprofile) return json(res, 404, { error: "no_profile" });
      await db(`vakilcard_calendar_connections?profile_id=eq.${gprofile.id}`, {
        method: "DELETE",
        prefer: "return=minimal",
      });
      return json(res, 200, { ok: true });
    }

    // google_business_disconnect is GONE, with the OAuth flow it undid. There
    // is no longer anything that can write a row to
    // vakilcard_google_business_connections, so there is nothing to delete;
    // the table had zero rows when the scope was dropped. Leaving the endpoint
    // live would have been a route whose only possible outcome is a no-op,
    // still holding a DELETE against a table nothing writes.

    // ---- GET ?action=places_search — owner auth. Autocomplete as they type.
    //
    // Deliberately NOT Pro-gated. The Google Business TILE is shown to
    // everyone (founder, 29 Aug: "google business profile visible in the
    // vakilcard for both free and pro users"); it is only the Leave-a-Review
    // deep link that Pro unlocks, and that gate lives at read time in
    // profile.js. Gating the search here would stop a Free advocate linking
    // the listing they are entitled to display.
    if (req.method === "GET" && action === "places_search") {
      if (!placesConfigured()) {
        return json(res, 503, { error: "places_not_configured" });
      }
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });

      const q = String(req.query.q || "").trim();
      // Two characters is not a search, it is a bill. Google charges per
      // session, but an empty/near-empty input returns noise anyway.
      if (q.length < 3) return json(res, 200, { results: [] });

      const r = await placesFetch("/places:autocomplete", {
        method: "POST",
        body: {
          input: q.slice(0, 200),
          // Session token groups the typing and the final selection into ONE
          // billable session instead of one charge per keystroke. The client
          // mints it and sends the same value to places_link.
          ...(req.query.session ? { sessionToken: String(req.query.session).slice(0, 64) } : {}),
          // Indian advocates, Indian chambers. Keeps the list relevant and
          // short rather than offering a namesake in another country.
          includedRegionCodes: ["in"],
          languageCode: "en",
        },
      });
      if (!r.ok) return json(res, 502, { error: "places_unavailable" });

      const results = (r.data?.suggestions || [])
        .map((sug) => sug.placePrediction)
        .filter(Boolean)
        .slice(0, 6)
        .map((p) => ({
          placeId: p.placeId,
          name: p.structuredFormat?.mainText?.text || p.text?.text || "",
          address: p.structuredFormat?.secondaryText?.text || "",
        }))
        .filter((p) => p.placeId && p.name);
      return json(res, 200, { results });
    }

    // ---- POST {action:"places_link", placeId, session} — owner auth.
    // The one write. Fetches the listing once and CACHES it on the profile:
    // a public card must never cause a Places call (see the field-mask note
    // above — rating/userRatingCount bill on the Enterprise SKU).
    if (req.method === "POST" && action === "places_link") {
      if (!placesConfigured()) {
        return json(res, 503, { error: "places_not_configured" });
      }
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const rows = await db(`vakilcard_profiles?account_id=eq.${who.accountId}&select=id`);
      const gprofile = rows[0];
      if (!gprofile) return json(res, 404, { error: "no_profile" });

      const b = await readJsonBody(req);
      const placeId = String(b.placeId || "").trim();
      // Place IDs are opaque, but they are always URL-safe and never long
      // enough to be someone smuggling a path in. Reject anything else rather
      // than interpolating it into a Google URL.
      if (!placeId || placeId.length > 300 || !/^[A-Za-z0-9_-]+$/.test(placeId)) {
        return json(res, 400, { error: "bad_place_id" });
      }

      const qs = b.session
        ? `?sessionToken=${encodeURIComponent(String(b.session).slice(0, 64))}`
        : "";
      const r = await placesFetch(`/places/${placeId}${qs}`, { fieldMask: PLACE_FIELDS });
      if (!r.ok) return json(res, 502, { error: "places_unavailable" });

      const d = r.data || {};
      const links = d.googleMapsLinks || {};
      const patch = {
        google_place_id: d.id || placeId,
        google_business_name: d.displayName?.text || null,
        // placeUri is the listing itself — what the Google Business tile
        // opens. Falls back to the reviews view so the tile is never dead.
        google_business_url: links.placeUri || links.reviewsUri || null,
        // The REAL review deep link, straight from Google. Pro-gated at read
        // time in profile.js; stored for everyone so an upgrade is instant.
        google_review_link: links.writeAReviewUri || null,
        google_rating: typeof d.rating === "number" ? d.rating : null,
        google_review_count: Number.isFinite(d.userRatingCount) ? d.userRatingCount : null,
        google_place_synced_at: new Date().toISOString(),
      };
      await db(`vakilcard_profiles?id=eq.${gprofile.id}`, {
        method: "PATCH",
        body: patch,
        prefer: "return=minimal",
      });

      return json(res, 200, {
        ok: true,
        place: {
          placeId: patch.google_place_id,
          name: patch.google_business_name,
          address: d.formattedAddress || null,
          rating: patch.google_rating,
          reviewCount: patch.google_review_count,
          url: patch.google_business_url,
        },
      });
    }

    // ---- POST {action:"places_unlink"} — owner auth ----------------------
    if (req.method === "POST" && action === "places_unlink") {
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const rows = await db(`vakilcard_profiles?account_id=eq.${who.accountId}&select=id`);
      const gprofile = rows[0];
      if (!gprofile) return json(res, 404, { error: "no_profile" });
      await db(`vakilcard_profiles?id=eq.${gprofile.id}`, {
        method: "PATCH",
        body: {
          google_place_id: null,
          google_business_name: null,
          google_business_url: null,
          google_review_link: null,
          google_rating: null,
          google_review_count: null,
          google_place_synced_at: null,
        },
        prefer: "return=minimal",
      });
      return json(res, 200, { ok: true });
    }

    // ---- GET ?action=public_slots — no auth, visitor-facing -------------
    if (req.method === "GET" && action === "public_slots") {
      const profile = await loadPublicProfile(req.query.username);
      if (!profile) return json(res, 404, { error: "not_found" });
      const pro = isProActive(profile);
      const windows = sanitizeBookingWindows(profile.booking_windows);
      const busy = pro && calendarConfigured() ? await freeBusy(profile.id, { days: 14 }) : [];
      const slots = expandBookingSlots(windows, { days: 14, busy });
      return json(res, 200, {
        pro,
        slots,
        payment: pro
          ? {
              required: true,
              consultation_fee: profile.payment ? profile.payment.consultation_fee : null,
              upi_configured: !!(profile.payment && profile.payment.upi_id),
            }
          : { required: false },
      });
    }

    // ---- POST {action:"request"} — no auth, visitor-facing --------------
    if (req.method === "POST" && action === "request") {
      const b = await readJsonBody(req);
      const profile = await loadPublicProfile(b.username);
      if (!profile) return json(res, 404, { error: "not_found" });
      const clientName = str(b.client_name, 120);
      const clientPhone = str(b.client_phone, 20);
      if (!clientName || !clientPhone) return json(res, 400, { error: "name_and_phone_required" });
      const pro = isProActive(profile);
      const startsAt = b.start ? new Date(b.start) : null;
      const endsAt = b.end ? new Date(b.end) : null;
      if (!startsAt || isNaN(startsAt.getTime())) return json(res, 400, { error: "invalid_slot" });

      let bookingType = "consultation";
      let amountInr = null;
      let paymentStatus = "not_required";
      let payLink = null;

      if (pro) {
        bookingType = b.booking_type === "custom" ? "custom" : "consultation";
        if (bookingType === "consultation") {
          amountInr = profile.payment ? Number(profile.payment.consultation_fee) || null : null;
        } else {
          amountInr = Number.isFinite(+b.amount_inr) ? Math.max(1, +b.amount_inr) : null;
        }
        const upiId = profile.payment && profile.payment.upi_id;
        if (upiId && amountInr) {
          paymentStatus = "pending";
          payLink = upiDeepLink({ upiId, name: profile.username, amountInr, note: "VakilCard appointment" });
        }
        // No UPI ID / no fee configured on a Pro profile: degrade to
        // not_required rather than blocking the booking — never a dead end.
      }

      const [saved] = await db("vakilcard_appointment_requests", {
        method: "POST",
        body: {
          profile_id: profile.id,
          client_name: clientName,
          client_phone: clientPhone,
          purpose: str(b.purpose, 300),
          requested_date: startsAt.toISOString().slice(0, 10),
          requested_slot: `${startsAt.toISOString()}–${endsAt ? endsAt.toISOString() : ""}`,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt && !isNaN(endsAt.getTime()) ? endsAt.toISOString() : null,
          booking_type: bookingType,
          amount_inr: amountInr,
          payment_status: paymentStatus,
          payment_provider: paymentStatus === "pending" ? "upi_manual" : null,
          is_pro_booking: pro,
        },
        prefer: "return=representation",
      });

      // ---- Upgrade the honour-system link to a VERIFIABLE one, when allowed.
      //
      // 🔴 UNRESOLVED BUSINESS DECISION — READ BEFORE SETTING PAYMENTS_ENABLED.
      //
      // These two payment paths do not move money to the same place, and that
      // difference is not a technical detail:
      //
      //   upi:// deep link  — the visitor pays the ADVOCATE directly (`pa` is
      //     the advocate's own UPI id). Vakilpedia never touches the funds.
      //     That is also precisely WHY it can never be verified: there is no
      //     gateway in the path, so there is nothing to send a webhook.
      //
      //   Razorpay Payment Link — the visitor pays into the account this
      //     RAZORPAY_KEY_ID belongs to, i.e. DatarOne's. Verification and
      //     custody are the same coin: we can confirm the money only because
      //     we received it. Vakilpedia then OWES the advocate their fee.
      //
      // Collecting third parties' fees is a funds-flow and regulatory question
      // (payment-aggregator territory in India), not an engineering one. The
      // clean answer is Razorpay Route: onboard each advocate as a Linked
      // Account (name, contact, email, bank details) and split the payment so
      // it settles to them, with only a platform fee retained. That is an
      // additive change here -- a `transfers` array on the link -- not a
      // rewrite, which is why this code is shaped this way.
      //
      // Until that decision is made, this branch stays unreachable: it requires
      // rzp.paymentsAllowed(), which is PAYMENTS_ENABLED and defaults OFF.
      // Do not flip that variable to test booking payments without settling
      // where the advocate's money is supposed to land.
      //
      // The row is written FIRST and the link created after, on purpose: the
      // appointment exists even if Razorpay is having a bad morning, and its id
      // is what binds the link back to this row. Every failure here degrades to
      // the upi:// link already computed above -- a visitor never sees a dead
      // end because a gateway was slow.
      //
      // Both gates must be open. paymentsAllowed() is the DatarOne
      // incorporation switch (PAYMENTS_ENABLED, default OFF): until the
      // Certificate issues, this whole branch is unreachable and behaviour is
      // byte-identical to what shipped before it existed.
      let payUrl = null;
      if (paymentStatus === "pending" && amountInr && rzp.configured() && rzp.paymentsAllowed()) {
        try {
          // Razorpay requires expire_by comfortably in the future, so a slot
          // starting within the next half hour simply gets no expiry rather
          // than a rejected request. Otherwise the link dies at the slot start
          // or in 24h, whichever comes first -- an unpaid link must never stay
          // payable after the appointment it was for.
          const slotMs = startsAt.getTime();
          const nowMs = Date.now();
          const expiryMs = Math.min(slotMs, nowMs + 24 * 3600 * 1000);
          const expireBy = expiryMs - nowMs > 30 * 60 * 1000 ? Math.floor(expiryMs / 1000) : undefined;

          const link = await rzp.createPaymentLink({
            amountInr,
            description: `Appointment with ${profile.full_name || profile.username} — ${formatSlotIST(startsAt)}`,
            customerName: clientName,
            customerPhone: clientPhone,
            referenceId: saved.id,
            callbackUrl: `${GCAL_DASHBOARD_SITE}/${profile.username}`,
            expireBy,
            notes: {
              product: "vakilcard",
              appointment_id: saved.id,
              profile_id: profile.id,
            },
          });
          if (link && link.short_url && link.id) {
            await db(`vakilcard_appointment_requests?id=eq.${encodeURIComponent(saved.id)}`, {
              method: "PATCH",
              body: { razorpay_payment_link_id: link.id, payment_provider: "razorpay" },
              prefer: "return=minimal",
            });
            payUrl = link.short_url;
            // The upi:// link is withheld once a verifiable one exists. Offering
            // both would hand the visitor a way to pay that we cannot confirm,
            // for a booking the webhook will then never confirm.
            payLink = null;
          }
        } catch (e) {
          console.error("[vakilcard/booking] payment link creation failed:", e && (e.message || e));
        }
      }

      trackEvent(profile.id, "appointment", req.headers["referer"]).catch(() => {});

      // Nothing is owed, so the advocate is told now. When money IS owed the
      // notification waits for the webhook -- an alert for a slot nobody has
      // paid for trains the advocate to ignore the alerts that matter.
      if (paymentStatus === "not_required") {
        notifyOwnerOfBooking(profile, saved, { paid: false }).catch(() => {});
      }

      return json(res, 200, {
        ok: true,
        id: saved.id,
        payment_status: paymentStatus,
        pay_link: payLink,
        pay_url: payUrl,
        amount_inr: amountInr,
      });
    }

    // ---- POST {action:"confirm_payment"} — no auth, visitor self-report -
    if (req.method === "POST" && action === "confirm_payment") {
      const b = await readJsonBody(req);
      const id = str(b.request_id, 100);
      if (!id) return json(res, 400, { error: "request_id_required" });
      const rows = await db(
        `vakilcard_appointment_requests?id=eq.${encodeURIComponent(id)}&select=id,profile_id,payment_status,razorpay_payment_link_id`
      );
      const reqRow = rows[0];
      if (!reqRow) return json(res, 404, { error: "not_found" });
      // A booking issued a Razorpay Payment Link is confirmed by the webhook or
      // not at all. Letting the visitor self-report on that path would recreate
      // exactly the hole the gateway was introduced to close -- and would do it
      // invisibly, since the row would read "claimed_paid" as though a human
      // owner still had to check.
      if (reqRow.razorpay_payment_link_id) {
        return json(res, 409, { error: "gateway_payment_pending" });
      }
      if (reqRow.payment_status !== "pending") return json(res, 409, { error: "not_pending" });
      await db(`vakilcard_appointment_requests?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { payment_status: "claimed_paid" },
        prefer: "return=minimal",
      });
      trackEvent(reqRow.profile_id, "payment_claimed", null).catch(() => {});
      return json(res, 200, { ok: true, payment_status: "claimed_paid" });
    }

    // ---- Everything below requires the owner's own session --------------
    const { profile, error } = await loadOwnerProfile(req);
    if (error) return json(res, error, { error: error === 401 ? "unauthenticated" : "no_profile" });
    const pro = isProActive(profile);

    if (req.method === "GET") {
      // google_business_connected / google_business_name are no longer
      // reported. Nothing can set them (the OAuth flow that did is gone) and
      // nothing reads them (the dashboard's Business row went with it), so the
      // third query was a round-trip on every dashboard load to answer a
      // question with one possible answer.
      const [requests, connRows] = await Promise.all([
        db(`vakilcard_appointment_requests?profile_id=eq.${profile.id}&select=*&order=created_at.desc&limit=100`),
        pro
          ? db(`vakilcard_calendar_connections?profile_id=eq.${profile.id}&select=profile_id`)
          : Promise.resolve([]),
      ]);
      return json(res, 200, {
        pro,
        windows: sanitizeBookingWindows(profile.booking_windows),
        calendar_platform_configured: calendarConfigured(),
        calendar_connected: connRows.length > 0,
        requests,
      });
    }

    if (req.method === "POST" && action === "save_windows") {
      const b = await readJsonBody(req);
      const windows = sanitizeBookingWindows(b.windows);
      await db(`vakilcard_profiles?id=eq.${profile.id}`, {
        method: "PATCH",
        body: { booking_windows: windows },
        prefer: "return=minimal",
      });
      return json(res, 200, { ok: true, windows });
    }

    if (req.method === "POST" && action === "manage") {
      const b = await readJsonBody(req);
      const id = str(b.request_id, 100);
      if (!id) return json(res, 400, { error: "request_id_required" });
      const rows = await db(
        `vakilcard_appointment_requests?id=eq.${encodeURIComponent(id)}&profile_id=eq.${profile.id}&select=*`
      );
      const target = rows[0];
      if (!target) return json(res, 404, { error: "not_found" });

      if (b.op === "confirm_payment_received") {
        if (!["pending", "claimed_paid"].includes(target.payment_status))
          return json(res, 409, { error: "no_payment_pending" });
        await db(`vakilcard_appointment_requests?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: { payment_status: "confirmed" },
          prefer: "return=minimal",
        });
        return json(res, 200, { ok: true, payment_status: "confirmed" });
      }

      const status = str(b.status, 20);
      if (!["confirmed", "declined", "completed"].includes(status))
        return json(res, 400, { error: "invalid_status" });
      // Pro bookings that required payment must have it confirmed by the
      // owner before the appointment itself can be confirmed — never
      // auto-confirm an unpaid Pro booking just because the owner clicked
      // "confirm" on the appointment itself.
      if (status === "confirmed" && target.is_pro_booking && target.payment_status !== "not_required" && target.payment_status !== "confirmed") {
        return json(res, 409, { error: "payment_not_confirmed" });
      }
      await db(`vakilcard_appointment_requests?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { status },
        prefer: "return=minimal",
      });
      return json(res, 200, { ok: true, status });
    }

    return json(res, 405, { error: "method_not_allowed" });
  } catch (e) {
    return json(res, 500, { error: "server_error" });
  }
};
