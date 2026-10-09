// VakilCard appointment booking.
//   PRO ONLY since 6 Oct 2026 (founder): weekly slots, client requests, and the calendar sync.
//   The lawyer picks the calendar in the slot builder: the one connected inside VakilCard, or a
//   CaseLinx workspace calendar (firm or personal) -- shared with hearings, needs the Rs100/month
//   VakilCard-CaseLinx connection (_calendarSource.js).
//   Free cards: the Book button opens WhatsApp to the lawyer with a ready-made message
//   (public/ds mount.js) -- public_slots / request answer "Pro only" for a Free card.
//
// Endpoints (all on this one handler, disambiguated by method + action):
//   GET  ?action=config                      owner auth  — windows, requests, calendar status
//   GET  ?action=public_slots&username=..    no auth     — bookable slots for a published profile
//   POST {action:"save_windows", windows}    owner auth  — persist weekly availability
//   POST {action:"request", ...}             no auth     — visitor requests a slot
//   POST {action:"confirm_payment", id}      no auth     — visitor self-reports "I've paid"
//   POST {action:"manage", id, op, ...}      owner auth  — confirm/decline/complete a request
//
// PAY AT THE APPOINTMENT — the only honest model available (2026-08-29).
//
// The advocate's fee is paid DIRECTLY to the advocate, in person or on their
// own UPI. Vakilpedia never receives, holds, routes or verifies that money, so
// booking never collects and never claims to have confirmed a payment.
//
// This is a rails fact, not a missing feature. A upi:// link hands control to
// the payer's UPI app and the app returns NOTHING to the web page; a merchant
// learns the outcome only from a provider's server-to-server callback or
// status API, both of which need a provider relationship. The rails that could
// confirm a payment either put DatarOne in custody of client money (Payment
// Aggregator activity under RBI's framework, and prohibited here) or require
// every advocate to complete their own payment-provider KYC. So the booking is
// real, the fee is DUE, and nobody pretends it was verified.
// Assessment: Docs/VAKILCARD_PAYMENT_RAIL_FEASIBILITY_2026-08-29.md
//
// REMOVED on 2026-08-29, deliberately: the Razorpay Payment Link creation, its
// signed webhook, and the visitor's "I've paid" self-report. The first two put
// DatarOne in the money path. The third wrote `claimed_paid` on a stranger's
// word — a state that LOOKED like verification and was not, which is worse
// than having no state at all.
const { db, readJsonBody, resolveAccount, trackEvent, sanitizeBookingWindows, expandBookingSlots } = require("./_lib");
const { isProActive, requirePro, primePaidPlans } = require("./_entitlements");
const { calendarChoices, cardLinkAllowed, caselinxCalendarAccess } = require("./_calendarSource");
const { sign, verify } = require("./_jwt");
const messaging = require("./_messaging");
const email = require("./_email");
const crypto = require("crypto");
const meeting = require("./_meeting");

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

/**
 * The calendar this card's appointments use, with a valid token -- or null (windows only).
 * 'caselinx': a CaseLinx workspace calendar (firm or personal), shared with hearings, only while
 * the VakilCard-CaseLinx connection is held; otherwise falls back to VakilCard's own connection.
 * Never throws.
 */
async function calendarAccess(profile) {
  try {
    if (profile && profile.calendar_source === "caselinx" && profile.calendar_firm_id && profile.account_id) {
      if (await cardLinkAllowed(profile.account_id)) {
        const a = await caselinxCalendarAccess(profile.account_id, profile.calendar_firm_id);
        if (a) return { token: a.token, calendarId: a.calendarId, canWrite: true, source: "caselinx" };
      }
    }
    if (!calendarConfigured()) return null;
    const rows = await db(`vakilcard_calendar_connections?profile_id=eq.${profile.id}&select=calendar_id,granted_scopes`);
    const conn = rows[0];
    if (!conn) return null;
    const token = await gcalValidAccessToken(profile.id);
    if (!token) return null;
    return { token, calendarId: conn.calendar_id || "primary", canWrite: scopeAllowsWrite(conn.granted_scopes), source: "vakilcard" };
  } catch {
    return null;
  }
}

/** Free/busy ranges for the next `days` days, or [] on any failure/absence
 *  — treated identically to "not connected" (windows-only). */
async function freeBusy(profile, { days = 14 } = {}) {
  const access = await calendarAccess(profile);
  if (!access) return [];
  const { token, calendarId } = access;
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
    `vakilcard_profiles?account_id=eq.${who.accountId}&select=id,account_id,username,full_name,subscription_plan,subscription_status,subscription_expires_at,booking_windows,booking_buffer_minutes,booking_min_notice_hours,calendar_source,calendar_firm_id`
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
      `&select=id,username,full_name,email,account_id,phone,whatsapp,subscription_plan,subscription_status,subscription_expires_at,booking_windows,booking_buffer_minutes,booking_min_notice_hours,calendar_source,calendar_firm_id,vakilcard_payment_prefs(*)`
  );
  const p = rows[0];
  if (!p) return null;
  // The embed can arrive as an OBJECT, not an array, and dropping that case
  // silently disabled every paid booking on the platform.
  //
  // vakilcard_payment_prefs has PRIMARY KEY (profile_id) -- the foreign key
  // column IS the primary key -- so PostgREST resolves the relationship as
  // to-ONE and returns a single object rather than a one-element array. The
  // old ternary handled only the array branch and mapped the object branch to
  // null, so `profile.payment` was ALWAYS null here: consultation_fee read as
  // unset, upi_configured as false, and every Pro booking degraded to
  // payment_status 'not_required'. A visitor was never asked to pay, on any
  // card, however the owner had configured their fee.
  //
  // It hid because the SSR card renders the same data through _lib.js's
  // loadProfileBundle, which handles both shapes -- so the pay tile showed the
  // UPI id correctly on the very card whose booking sheet said there was none.
  // This mirrors that unwrap exactly; _lib.js:361 is the canonical form.
  p.payment = Array.isArray(p.vakilcard_payment_prefs)
    ? p.vakilcard_payment_prefs[0] || null
    : p.vakilcard_payment_prefs || null;
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
        // What Google ACTUALLY granted, straight from the token response. The
        // requested scope and the granted scope are not the same thing, and a
        // token minted before ab08f87 widened GCAL_SCOPE carries only
        // free/busy — writing an event with it 403s.
        granted_scopes: t.scope || null,
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

/** Does this connection's grant allow writing events? NULL scope means the
 *  connection predates the recording of it — unknown, so we try anyway and let
 *  Google answer, rather than silently skipping. */
function scopeAllowsWrite(grantedScopes) {
  if (!grantedScopes) return true; // unknown — attempt it
  return /calendar\.events|auth\/calendar(\s|$)/.test(grantedScopes);
}

/**
 * Put the appointment in the advocate's connected Google Calendar.
 *
 * NEVER THROWS AND NEVER BLOCKS. A booking is confirmed by the row in our
 * database; the calendar is a convenience on top. Google being slow, revoked or
 * read-only must not cost the advocate a client. Returns a short reason string
 * for the logs so a failure is diagnosable instead of invisible — the previous
 * failure mode here was "the feature silently does nothing".
 */
async function gcalCreateEvent(profile, appointment, opts) {
  const o = opts || {};
  try {
    const access = await calendarAccess(profile);
    if (!access) return { ok: false, reason: "not_connected" };
    if (!access.canWrite) {
      console.error(`[vakilcard/booking] calendar write skipped pid=${profile.id} — grant is read-only, reconnect required`);
      return { ok: false, reason: "reconnect_required" };
    }
    const { token, calendarId } = access;
    const start = new Date(appointment.starts_at);
    // Fall back to a 30-minute block when the slot carried no explicit end —
    // Google rejects an event without one.
    const end = appointment.ends_at ? new Date(appointment.ends_at) : new Date(start.getTime() + 30 * 60000);
    const amount = Number(appointment.amount_inr);

    const description = [
      `Client: ${appointment.client_name || "—"}`,
      `Phone: ${appointment.client_phone || "—"}`,
      appointment.purpose ? `Purpose: ${appointment.purpose}` : null,
      amount ? `Amount due: Rs ${amount} (payable to you at the appointment)` : "No fee set",
      o.manageUrl ? `Reschedule or cancel: ${o.manageUrl}` : null,
      "",
      "Booked via VakilCard",
    ]
      .filter(Boolean)
      .join("\n");

    // Booking-link meetings (9 Oct 2026): the same event also carries an online-meeting link
    // (Google Meet today, via ./_meeting.js) and, when the client typed an email, invites them.
    const prov = o.provider && o.provider.calendar ? o.provider : null;
    const attendee = o.attendeeEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.attendeeEmail) ? o.attendeeEmail : null;
    const qs = [];
    if (prov) qs.push(prov.calendar.query);
    if (attendee) qs.push("sendUpdates=all");
    const evBody = {
      summary: `${prov ? "Meeting" : "Consultation"} — ${appointment.client_name || "Client"} (VakilCard)`,
      description,
      start: { dateTime: start.toISOString(), timeZone: "Asia/Kolkata" },
      end: { dateTime: end.toISOString(), timeZone: "Asia/Kolkata" },
      source: { title: "VakilCard", url: `${GCAL_DASHBOARD_SITE}/${profile.username || ""}` },
    };
    if (prov) Object.assign(evBody, prov.calendar.eventFields(`vc-${appointment.id || Date.now()}-${Date.now()}`));
    if (attendee) evBody.attendees = [{ email: attendee, displayName: appointment.client_name || undefined }];
    const evUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` + (qs.length ? `?${qs.join("&")}` : "");
    const r = await fetchWithTimeout(
      evUrl,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(evBody),
      },
      8000
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      // 403 with an insufficient-scope body is the stale-grant case, and it is
      // the one an advocate can actually fix — say so distinctly.
      const reason =
        r.status === 403 && /insufficient|scope/i.test(body) ? "reconnect_required" : `http_${r.status}`;
      console.error(`[vakilcard/booking] calendar insert failed pid=${profile.id} ${reason} ${body.slice(0, 200)}`);
      return { ok: false, reason };
    }
    let ev = await r.json().catch(() => ({}));
    console.log(`[vakilcard/booking] calendar event created pid=${profile.id} event=${ev.id}`);
    let meetUrl = prov ? prov.calendar.urlFrom(ev) : null;
    // Google fills the meeting link in a moment after insert on rare occasions: look once more.
    if (prov && !meetUrl && ev.id) {
      await new Promise((ok) => setTimeout(ok, 900));
      const g = await fetchWithTimeout(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(ev.id)}?conferenceDataVersion=1`,
        { headers: { Authorization: `Bearer ${token}` } },
        6000
      ).catch(() => null);
      if (g && g.ok) meetUrl = prov.calendar.urlFrom(await g.json().catch(() => null));
    }
    return { ok: true, eventId: ev.id || null, calendarId, meetUrl };
  } catch (e) {
    console.error("[vakilcard/booking] calendar insert threw:", e && (e.message || e));
    return { ok: false, reason: "exception" };
  }
}

/**
 * Tell the advocate a client booked, and what to collect.
 *
 * There is no "paid" variant any more and there must not be one: VakilCard is
 * not in the money path, so it is never in a position to tell an advocate that
 * a client has paid. The message says what is DUE; the advocate is the only one
 * who can see it arrive.
 */
async function notifyOwnerOfBooking(profile, appointment) {
  const amount = Number(appointment.amount_inr);
  const paymentLine = amount ? `Rs ${amount} due at the appointment` : "No fee set";
  const when = formatSlotIST(appointment.starts_at);
  const dashboard = `${GCAL_DASHBOARD_SITE}/${profile.username || ""}/dashboard`;
  const client = appointment.client_name || "A client";

  // ---- WhatsApp -----------------------------------------------------------
  try {
    const phone = await ownerPhone(profile);
    if (phone) {
      const sent = await messaging.sendTemplate({
        product: "vakilcard",
        module: "notification",
        templateName: "vakilcard_booking_alert",
        phoneE164: phone,
        accountId: profile.account_id || null,
        bodyParams: [client, when, paymentLine, dashboard],
      });

      // FALLBACK, and the reason this exists: message_templates rows are OUR
      // registry, not a Meta approval. Until Meta approves
      // vakilcard_booking_alert the template send returns template_missing and
      // the advocate hears NOTHING -- which is exactly what happened on
      // 2026-08-29 (three 'skipped' rows in message_log against real bookings).
      //
      // Free-form session text needs an open 24-hour customer-service window,
      // so it reaches an advocate who has messaged the business number recently
      // and not one who hasn't. That is a real limitation, not a fix: it is
      // strictly better than silence and strictly worse than approval. Both
      // attempts are logged, so "why did nobody get told" stays answerable.
      if (!sent || !sent.ok) {
        console.error(
          `[vakilcard/booking] template alert unavailable (${sent && sent.error}) — falling back to session text`
        );
        await messaging.sendText({
          product: "vakilcard",
          phoneE164: phone,
          accountId: profile.account_id || null,
          text:
            `New appointment booked via VakilCard\n\n` +
            `Client: ${client}\n` +
            `Phone: ${appointment.client_phone || "—"}\n` +
            `When: ${when}\n` +
            `${paymentLine}\n\n` +
            `Details: ${dashboard}`,
        });
      }
    }
  } catch (e) {
    console.error("[vakilcard/booking] whatsapp alert failed:", e && (e.message || e));
  }

  // ---- Email --------------------------------------------------------------
  // A second, independent channel on purpose: WhatsApp delivery here depends on
  // a Meta approval we do not control, and an advocate who misses the booking
  // misses the client.
  try {
    // profile.email must be in loadPublicProfile's select or this is silently
    // false forever. It was, until 2026-08-29: the column was simply not
    // requested, so `profile.email` was undefined, the branch never ran, and
    // sendEmail -- which logs even when unconfigured -- never got the chance
    // to log anything. The absence of a row is what exposed it.
    if (!profile.email) {
      console.error(`[vakilcard/booking] no email on profile ${profile.id} — booking email not sent`);
    } else {
      await email.sendEmail({
        to: profile.email,
        accountId: profile.account_id || null,
        subject: `New appointment: ${client} — ${when}`,
        text:
          `You have a new appointment, booked via VakilCard.\n\n` +
          `Client:    ${client}\n` +
          `Phone:     ${appointment.client_phone || "—"}\n` +
          `When:      ${when}\n` +
          (appointment.purpose ? `Purpose:   ${appointment.purpose}\n` : "") +
          `Payment:   ${paymentLine}\n\n` +
          `The fee is paid directly to you at the appointment. VakilCard does\n` +
          `not collect or hold any client payment.\n\n` +
          `Manage this booking: ${dashboard}\n\n` +
          `Booked via VakilCard`,
      });
    }
  } catch (e) {
    console.error("[vakilcard/booking] email alert failed:", e && (e.message || e));
  }
}

// ---- Personal booking links (founder, 9 Oct 2026) -------------------------
// A lawyer makes a one-client link on their own card and sends it by WhatsApp or email. The client
// opens vakilpedia.com/<username>?book=<token>, picks a free time and gets a Google Meet link
// (provider-agnostic: ./_meeting.js).
//   FREE for every card : the link itself, weekly hours, Google Calendar, meeting length per link,
//                         gap between meetings, minimum notice.
//   PRO                 : client can reschedule / cancel (?manage=<token>), reminder emails to both,
//                         reusable links.
// Single-use links last 7 days. Everything uses the lawyer's own calendar (Google or CaseLinx).
const LINK_SITE = "https://www.vakilpedia.com";
const DURATIONS = [15, 30, 45, 60];
const BUFFERS = [0, 5, 10, 15, 30, 60];
const NOTICES = [0, 1, 2, 4, 12, 24, 48];
const newToken = (n = 9) => crypto.randomBytes(n).toString("base64url");

/** Busy ranges that block a link slot: the lawyer's calendar PLUS meetings we already hold (so a
 *  calendar hiccup can never double-book). `exceptId` keeps a meeting from blocking its own move. */
async function profileBusy(profile, exceptId, days = 14) {
  const busy = await freeBusy(profile, { days });
  try {
    const rows = await db(
      `vakilcard_appointment_requests?profile_id=eq.${profile.id}&status=in.(pending,confirmed)` +
        `&starts_at=gte.${encodeURIComponent(new Date().toISOString())}&select=id,starts_at,ends_at`
    );
    for (const r of rows || []) {
      if (exceptId && r.id === exceptId) continue;
      if (r.starts_at) busy.push({ start: r.starts_at, end: r.ends_at || new Date(new Date(r.starts_at).getTime() + 30 * 60000).toISOString() });
    }
  } catch {
    /* calendar busy times alone are still a safe answer */
  }
  return busy;
}

/** Bookable slots for one link: lawyer's weekly hours, the link's meeting length, the gap between
 *  meetings and the minimum notice. */
function linkSlots(profile, durationMinutes, busy, customWindows) {
  const dur = DURATIONS.includes(Number(durationMinutes)) ? Number(durationMinutes) : null;
  const custom = cleanCustomWindows(customWindows);
  let windows = sanitizeBookingWindows(profile.booking_windows);
  if (dur) windows = windows.map((w) => Object.assign({}, w, { slot_minutes: dur }));
  const gap = (BUFFERS.includes(Number(profile.booking_buffer_minutes)) ? Number(profile.booking_buffer_minutes) : 0) * 60000;
  const padded = gap
    ? busy.map((b) => ({ start: new Date(new Date(b.start).getTime() - gap).toISOString(), end: new Date(new Date(b.end).getTime() + gap).toISOString() }))
    : busy;
  // The lawyer chose these times for this one link himself, so his weekly hours and minimum notice do not apply;
  // calendar busy times (plus the gap between meetings) still do.
  if (custom.length) return customLinkSlots(custom, dur || 30, padded);
  const noticeH = NOTICES.includes(Number(profile.booking_min_notice_hours)) ? Number(profile.booking_min_notice_hours) : 4;
  const cutoff = Date.now() + noticeH * 3600000;
  return expandBookingSlots(windows, { days: 14, busy: padded }).filter((s) => new Date(s.start).getTime() >= cutoff);
}

/** Per-link "my own times" (founder, 9 Oct 2026): absolute {start,end} ISO windows the lawyer picks when he
 *  sends a link, even outside his weekly hours. His weekly hours keep governing clients who book from the card. */
const MAX_CUSTOM_WINDOWS = 10;
const MAX_WINDOW_MS = 14 * 3600000;
const MAX_AHEAD_MS = 30 * 86400000;
function cleanCustomWindows(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const w of input) {
    const a = w && new Date(w.start).getTime(), b = w && new Date(w.end).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > MAX_WINDOW_MS) continue;
    out.push({ start: new Date(a).toISOString(), end: new Date(b).toISOString() });
    if (out.length >= MAX_CUSTOM_WINDOWS) break;
  }
  return out.sort((x, y) => x.start.localeCompare(y.start));
}
function customLinkSlots(windows, stepMinutes, busy) {
  const step = stepMinutes * 60000, now = Date.now();
  const ranges = busy.map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() })).filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e));
  const seen = new Set(), out = [];
  for (const w of windows) {
    const ws = new Date(w.start).getTime(), we = new Date(w.end).getTime();
    for (let t = ws; t + step <= we; t += step) {
      if (t <= now || seen.has(t)) continue;
      if (ranges.some((r) => t < r.e && t + step > r.s)) continue;
      seen.add(t);
      out.push({ start: new Date(t).toISOString(), end: new Date(t + step).toISOString() });
    }
  }
  out.sort((x, y) => x.start.localeCompare(y.start));
  return out.slice(0, 200);
}
/** How many days of calendar busy-time a link needs: 14, or further when its own windows reach beyond that. */
function linkBusyDays(customWindows) {
  const c = cleanCustomWindows(customWindows);
  if (!c.length) return 14;
  const last = Math.max(...c.map((w) => new Date(w.end).getTime()));
  return Math.max(14, Math.min(31, Math.ceil((last - Date.now()) / 86400000) + 1));
}

// The fee a booking link asks for (founder, 9 Oct 2026). When the lawyer chose a fee for THIS link (fee_set) that choice wins,
// including "no fee"; links made before this existed keep falling back to his usual consultation fee on the card.
// VakilCard never collects it: it is payable to the advocate at the meeting.
function linkFee(link, profile) {
  if (link && link.fee_set) return Number(link.fee_inr) > 0 ? Math.round(Number(link.fee_inr)) : null;
  return profile && profile.payment ? Number(profile.payment.consultation_fee) || null : null;
}
function cleanFee(raw) {
  if (raw === undefined || raw === null || raw === "") return { ok: true, patch: {} };
  const n = Math.round(Number(raw));
  if (!isFinite(n) || n < 0 || n > 1000000) return { ok: false };
  return { ok: true, patch: { fee_set: true, fee_inr: n > 0 ? n : null } };
}

async function loadLink(username, token) {
  const profile = await loadPublicProfile(username);
  const tk = String(token || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (!profile || !tk) return { status: 404, error: "not_found" };
  const rows = await db(`vakilcard_booking_links?token=eq.${encodeURIComponent(tk)}&profile_id=eq.${profile.id}&select=*`);
  const link = rows[0];
  if (!link || link.status === "cancelled") return { status: 404, error: "not_found" };
  if (link.status === "booked") return { status: 410, error: "link_used", profile, link };
  if (new Date(link.expires_at).getTime() < Date.now()) return { status: 410, error: "link_expired", profile, link };
  return { profile, link };
}

/** A client's own booking, found by its private manage token. Pro lawyers only. */
async function loadManage(username, token) {
  const profile = await loadPublicProfile(username);
  const tk = String(token || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (!profile || !tk) return { status: 404, error: "not_found" };
  if (!isProActive(profile)) return { status: 402, error: "pro_required" };
  const rows = await db(`vakilcard_appointment_requests?manage_token=eq.${encodeURIComponent(tk)}&profile_id=eq.${profile.id}&select=*`);
  const appt = rows[0];
  if (!appt) return { status: 404, error: "not_found" };
  if (appt.status === "declined" || appt.cancelled_at) return { status: 410, error: "cancelled", profile, appt };
  if (!appt.starts_at || new Date(appt.starts_at).getTime() < Date.now()) return { status: 410, error: "meeting_past", profile, appt };
  return { profile, appt };
}

const apptMinutes = (a) => {
  const m = Math.round((new Date(a.ends_at || a.starts_at).getTime() - new Date(a.starts_at).getTime()) / 60000);
  return DURATIONS.includes(m) ? m : 30;
};

/** Move or remove the meeting's Google Calendar event. Never throws. */
async function gcalChangeEvent(profile, appt, change) {
  try {
    if (!appt.calendar_event_id) return { ok: false, reason: "no_event" };
    const access = await calendarAccess(profile);
    if (!access || !access.canWrite) return { ok: false, reason: "no_access" };
    const calId = encodeURIComponent(appt.calendar_id || access.calendarId);
    const base = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(appt.calendar_event_id)}`;
    const notify = appt.client_email ? "?sendUpdates=all" : "";
    const r = await fetchWithTimeout(
      base + notify,
      change.cancel
        ? { method: "DELETE", headers: { Authorization: `Bearer ${access.token}` } }
        : {
            method: "PATCH",
            headers: { Authorization: `Bearer ${access.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              start: { dateTime: change.start, timeZone: "Asia/Kolkata" },
              end: { dateTime: change.end, timeZone: "Asia/Kolkata" },
            }),
          },
      8000
    );
    return { ok: r.ok || r.status === 410, reason: r.ok ? null : `http_${r.status}` };
  } catch (e) {
    console.error("[vakilcard/booking] calendar change threw:", e && (e.message || e));
    return { ok: false, reason: "exception" };
  }
}

async function ownerEmail(profile, subject, text) {
  try {
    if (!profile.email) return;
    await email.sendEmail({ to: profile.email, accountId: profile.account_id || null, subject, text });
  } catch (e) {
    console.error("[vakilcard/booking] owner email failed:", e && (e.message || e));
  }
}

const whoIs = (profile) => {
  const n = String(profile.full_name || "").trim();
  return /^adv(ocate)?\.?\s/i.test(n) ? n : n ? `Adv. ${n}` : "your advocate";
};

module.exports = async function handler(req, res) {
  await primePaidPlans(); // admin "Paid plans" switch -- see _entitlements.js
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
    if (req.method === "POST" && (!req.body || typeof req.body !== "object")) {
      req.body = await readJsonBody(req);
    }
    const action = String(
      req.query.action || (req.body && typeof req.body === "object" && req.body.action) || ""
    );

    // ---- POST {action:"google_connect_url"} / {action:"gcal_connect_url"} — owner auth (Authorization header).
    // Returns Google's consent address as JSON; the app then sends the browser there. Added 9 Oct 2026: the old way
    // was a plain browser GET with the sign-in token pasted into the web address (?token=...). When that token did not
    // arrive (founder, Safari private window: the page showed {"error":"unauthenticated"}) the person was stranded on a
    // blank JSON page. A normal authenticated call refreshes an old token and reports a problem inside the app instead.
    // The GET versions below stay for old open tabs.
    if (req.method === "POST" && (action === "google_connect_url" || action === "gcal_connect_url")) {
      if (!calendarConfigured()) return notConfigured(res);
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const rows = await db(`vakilcard_profiles?account_id=eq.${who.accountId}&select=id`);
      const gp = rows[0];
      if (!gp) return json(res, 404, { error: "no_profile" });
      const state = sign({ pid: gp.id, typ: "gcal_state" }, { expiresInSec: 600 });
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
      return json(res, 200, { ok: true, url });
    }

    // ---- GET ?action=gcal_start — owner auth (header or query token). Free since 9 Oct 2026.
    if (req.method === "GET" && action === "gcal_start") {
      if (!calendarConfigured()) return notConfigured(res);
      const who = await resolveAccountForGcalStart(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const rows = await db(
        `vakilcard_profiles?account_id=eq.${who.accountId}&select=id,subscription_plan,subscription_status,subscription_expires_at`
      );
      const gprofile = rows[0];
      if (!gprofile) return json(res, 404, { error: "no_profile" });
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
      // Appointments are Pro (founder, 6 Oct 2026). A Free card's Book button opens WhatsApp in the
      // browser instead; an older cached card that still asks here gets no slots and falls back to
      // its WhatsApp/Call sheet.
      if (!pro) return json(res, 200, { pro: false, slots: [], whatsapp_only: true, payment: { required: false, amount_due: null } });
      const windows = sanitizeBookingWindows(profile.booking_windows);
      const busy = await freeBusy(profile, { days: 14 });
      const slots = expandBookingSlots(windows, { days: 14, busy });
      return json(res, 200, {
        pro,
        slots,
        // `required` is deliberately FALSE for everyone now: nothing is
        // collected before a booking, on any plan. `amount_due` is what the
        // visitor will owe the advocate AT the appointment, shown so the fee is
        // never a surprise. An older cached card bundle reads `required` and
        // simply shows no payment step, which is exactly the new behaviour.
        payment: {
          required: false,
          amount_due: pro && profile.payment ? Number(profile.payment.consultation_fee) || null : null,
        },
      });
    }

    // ---- GET ?action=link_info — no auth, the client opening a booking link ----
    if (req.method === "GET" && action === "link_info") {
      const L = await loadLink(req.query.username, req.query.token);
      if (L.error) return json(res, L.status, { error: L.error, name: L.profile ? L.profile.full_name : null });
      const prov = meeting.pickProvider(L.link.meeting_provider);
      const slots = linkSlots(L.profile, L.link.duration_minutes, await profileBusy(L.profile, undefined, linkBusyDays(L.link.custom_windows)), L.link.custom_windows);
      return json(res, 200, {
        ok: true,
        advocate: L.profile.full_name || null,
        client_name: L.link.reusable ? "" : L.link.client_name || "",
        has_email: !L.link.reusable && !!L.link.client_email,
        meeting: prov.label,
        minutes: DURATIONS.includes(Number(L.link.duration_minutes)) ? Number(L.link.duration_minutes) : null,
        timezone: "Asia/Kolkata",
        expires_at: L.link.expires_at,
        slots,
        amount_due: linkFee(L.link, L.profile),
      });
    }

    // ---- POST {action:"link_book"} — no auth, client confirms a time ---------
    if (req.method === "POST" && action === "link_book") {
      const b = await readJsonBody(req);
      const L = await loadLink(b.username, b.token);
      if (L.error) return json(res, L.status, { error: L.error });
      const { profile, link } = L;
      const pro = isProActive(profile);
      const startsAt = b.start ? new Date(b.start) : null;
      if (!startsAt || isNaN(startsAt.getTime())) return json(res, 400, { error: "invalid_slot" });
      // Only a time we are really offering (inside the lawyer's hours, not busy, past the notice) can be taken.
      const offered = linkSlots(profile, link.duration_minutes, await profileBusy(profile, undefined, linkBusyDays(link.custom_windows)), link.custom_windows);
      const slot = offered.find((x) => new Date(x.start).getTime() === startsAt.getTime());
      if (!slot) return json(res, 409, { error: "slot_taken" });
      const clientName = str(b.client_name, 120) || (link.reusable ? null : link.client_name);
      if (!clientName) return json(res, 400, { error: "name_required" });
      const clientEmail = str(b.client_email, 160) || (link.reusable ? null : link.client_email) || null;
      const clientPhone = str(b.client_phone, 20) || (link.reusable ? null : link.client_phone) || "—";
      const prov = meeting.pickProvider(link.meeting_provider);

      // Single-use links are claimed first, atomically: two taps at once can never make two meetings.
      if (link.reusable) {
        await db(`vakilcard_booking_links?id=eq.${link.id}`, { method: "PATCH", body: { uses: (link.uses || 0) + 1 }, prefer: "return=minimal" }).catch(() => {});
      } else {
        const claimed = await db(`vakilcard_booking_links?id=eq.${link.id}&status=eq.open`, {
          method: "PATCH",
          body: { status: "booked" },
          prefer: "return=representation",
        });
        if (!claimed || !claimed.length) return json(res, 409, { error: "link_used" });
      }

      const amountInr = linkFee(link, profile);
      const manageToken = newToken(12);
      let saved;
      try {
        [saved] = await db("vakilcard_appointment_requests", {
          method: "POST",
          body: {
            profile_id: profile.id,
            client_name: clientName,
            client_phone: clientPhone,
            client_email: clientEmail,
            purpose: str(b.purpose, 300) || link.purpose || null,
            requested_date: startsAt.toISOString().slice(0, 10),
            requested_slot: `${slot.start}–${slot.end}`,
            starts_at: slot.start,
            ends_at: slot.end,
            booking_type: "consultation",
            amount_inr: amountInr,
            payment_status: amountInr ? "due" : "not_required",
            payment_provider: null,
            is_pro_booking: pro,
            // The lawyer invited this client themselves, so the time is final once picked.
            status: "confirmed",
            meeting_provider: prov.key,
            booking_link_id: link.id,
            manage_token: manageToken,
          },
          prefer: "return=representation",
        });
      } catch (e) {
        if (!link.reusable) await db(`vakilcard_booking_links?id=eq.${link.id}`, { method: "PATCH", body: { status: "open" }, prefer: "return=minimal" }).catch(() => {});
        return json(res, 500, { error: "server_error" });
      }
      trackEvent(profile.id, "appointment", req.headers["referer"]).catch(() => {});

      const manageUrl = pro ? `${LINK_SITE}/${profile.username}?manage=${manageToken}` : null;
      const [, cal] = await Promise.allSettled([
        notifyOwnerOfBooking(profile, saved),
        gcalCreateEvent(profile, saved, { provider: prov, attendeeEmail: clientEmail, manageUrl }),
      ]);
      const made = cal && cal.status === "fulfilled" ? cal.value : null;
      const meetUrl = made && made.meetUrl ? made.meetUrl : null;
      await Promise.allSettled([
        db(`vakilcard_appointment_requests?id=eq.${saved.id}`, {
          method: "PATCH",
          body: { meeting_url: meetUrl, calendar_event_id: (made && made.eventId) || null, calendar_id: (made && made.calendarId) || null },
          prefer: "return=minimal",
        }),
        link.reusable ? Promise.resolve() : db(`vakilcard_booking_links?id=eq.${link.id}`, { method: "PATCH", body: { appointment_id: saved.id }, prefer: "return=minimal" }),
      ]);
      return json(res, 200, {
        ok: true,
        id: saved.id,
        start: slot.start,
        end: slot.end,
        meeting: prov.label,
        meet_url: meetUrl,
        // false = booked, but the calendar could not make the meeting link (lawyer's Google needs reconnecting)
        meet_ok: !!meetUrl,
        advocate: profile.full_name || null,
        amount_due: amountInr,
        manage_url: manageUrl,
      });
    }

    // ---- Pro: the client's own booking page (?manage=<token>) -----------------
    if (req.method === "GET" && action === "manage_info") {
      const M = await loadManage(req.query.username, req.query.token);
      if (M.error) return json(res, M.status, { error: M.error, advocate: M.profile ? M.profile.full_name : null });
      const { profile, appt } = M;
      const slots = linkSlots(profile, apptMinutes(appt), await profileBusy(profile, appt.id));
      return json(res, 200, {
        ok: true,
        advocate: profile.full_name || null,
        client_name: appt.client_name || "",
        start: appt.starts_at,
        end: appt.ends_at,
        meet_url: appt.meeting_url || null,
        meeting: meeting.pickProvider(appt.meeting_provider).label,
        rescheduled: appt.rescheduled_count || 0,
        timezone: "Asia/Kolkata",
        slots,
      });
    }

    if (req.method === "POST" && action === "manage_reschedule") {
      const b = await readJsonBody(req);
      const M = await loadManage(b.username, b.token);
      if (M.error) return json(res, M.status, { error: M.error });
      const { profile, appt } = M;
      if ((appt.rescheduled_count || 0) >= 3) return json(res, 409, { error: "too_many_changes" });
      const startsAt = b.start ? new Date(b.start) : null;
      if (!startsAt || isNaN(startsAt.getTime())) return json(res, 400, { error: "invalid_slot" });
      const offered = linkSlots(profile, apptMinutes(appt), await profileBusy(profile, appt.id));
      const slot = offered.find((x) => new Date(x.start).getTime() === startsAt.getTime());
      if (!slot) return json(res, 409, { error: "slot_taken" });
      const before = formatSlotIST(appt.starts_at);
      await db(`vakilcard_appointment_requests?id=eq.${appt.id}`, {
        method: "PATCH",
        body: {
          starts_at: slot.start,
          ends_at: slot.end,
          requested_date: new Date(slot.start).toISOString().slice(0, 10),
          requested_slot: `${slot.start}–${slot.end}`,
          rescheduled_count: (appt.rescheduled_count || 0) + 1,
          reminder_sent_at: null,
        },
        prefer: "return=minimal",
      });
      await Promise.allSettled([
        gcalChangeEvent(profile, appt, { start: slot.start, end: slot.end }),
        ownerEmail(
          profile,
          `Meeting moved: ${appt.client_name} — now ${formatSlotIST(slot.start)}`,
          `${appt.client_name} moved their meeting.\n\nWas:  ${before}\nNow:  ${formatSlotIST(slot.start)}\n` +
            (appt.meeting_url ? `Meet: ${appt.meeting_url}\n` : "") +
            `\nYour calendar has been updated.\n\nBooked via VakilCard`
        ),
      ]);
      return json(res, 200, { ok: true, start: slot.start, end: slot.end, meet_url: appt.meeting_url || null, advocate: profile.full_name || null });
    }

    if (req.method === "POST" && action === "manage_cancel") {
      const b = await readJsonBody(req);
      const M = await loadManage(b.username, b.token);
      if (M.error) return json(res, M.status, { error: M.error });
      const { profile, appt } = M;
      await db(`vakilcard_appointment_requests?id=eq.${appt.id}`, {
        method: "PATCH",
        body: { status: "declined", cancelled_at: new Date().toISOString() },
        prefer: "return=minimal",
      });
      await Promise.allSettled([
        gcalChangeEvent(profile, appt, { cancel: true }),
        ownerEmail(
          profile,
          `Meeting cancelled: ${appt.client_name} — ${formatSlotIST(appt.starts_at)}`,
          `${appt.client_name} cancelled their meeting for ${formatSlotIST(appt.starts_at)}.\n\nIt has been removed from your calendar and the time is open again.\n\nBooked via VakilCard`
        ),
      ]);
      return json(res, 200, { ok: true });
    }

    // ---- Pro: reminder emails, called by the scheduler (vercel.json "crons") --------
    // Vercel sends  Authorization: Bearer <CRON_SECRET>.  One reminder per meeting, sent by the first run
    // that sees it starting within the next 36 hours (so a once-a-day schedule still covers every
    // meeting; an hourly schedule sends it nearer the day before). A meeting booked less than 6 hours
    // before it starts gets none (they only just made it).
    if (req.method === "GET" && action === "cron_reminders") {
      const secret = process.env.CRON_SECRET || "";
      if (!secret) return json(res, 503, { error: "cron_not_configured" });
      if (String(req.headers.authorization || "") !== `Bearer ${secret}`) return json(res, 401, { error: "unauthorized" });
      const now = Date.now();
      const rows = await db(
        `vakilcard_appointment_requests?status=eq.confirmed&reminder_sent_at=is.null` +
          `&starts_at=gte.${encodeURIComponent(new Date(now + 30 * 60000).toISOString())}` +
          `&starts_at=lte.${encodeURIComponent(new Date(now + 36 * 3600000).toISOString())}` +
          `&select=id,profile_id,client_name,client_email,starts_at,created_at,meeting_url,manage_token&limit=100`
      );
      let sent = 0;
      for (const a of rows || []) {
        if (new Date(a.starts_at).getTime() - new Date(a.created_at).getTime() < 6 * 3600000) {
          await db(`vakilcard_appointment_requests?id=eq.${a.id}`, { method: "PATCH", body: { reminder_sent_at: new Date().toISOString() }, prefer: "return=minimal" }).catch(() => {});
          continue;
        }
        const prows = await db(`vakilcard_profiles?id=eq.${a.profile_id}&select=id,username,full_name,email,account_id,subscription_plan,subscription_status,subscription_expires_at`).catch(() => []);
        const p = prows && prows[0];
        // Claim first so an overlapping run cannot send twice.
        const got = await db(`vakilcard_appointment_requests?id=eq.${a.id}&reminder_sent_at=is.null`, {
          method: "PATCH",
          body: { reminder_sent_at: new Date().toISOString() },
          prefer: "return=representation",
        }).catch(() => []);
        if (!got || !got.length || !p || !isProActive(p)) continue;
        const when = formatSlotIST(a.starts_at);
        const manage = a.manage_token ? `${LINK_SITE}/${p.username}?manage=${a.manage_token}` : null;
        const tail = (a.meeting_url ? `Join: ${a.meeting_url}\n` : "") + (manage ? `Need to change it? Reschedule or cancel: ${manage}\n` : "");
        await Promise.allSettled([
          a.client_email
            ? email.sendEmail({ to: a.client_email, accountId: p.account_id || null, subject: `Reminder: meeting with ${whoIs(p)} — ${when}`, text: `This is a reminder of your meeting with ${whoIs(p)}.\n\nWhen: ${when}\n${tail}\nSent by VakilCard` })
            : Promise.resolve(),
          ownerEmail(p, `Reminder: meeting with ${a.client_name} — ${when}`, `You have a meeting with ${a.client_name}.\n\nWhen: ${when}\n${a.meeting_url ? `Join: ${a.meeting_url}\n` : ""}\nSent by VakilCard`),
        ]);
        sent += 1;
      }
      return json(res, 200, { ok: true, checked: (rows || []).length, sent });
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
      if (!pro) return json(res, 402, { error: "pro_required", feature: "booking", whatsapp_only: true });
      const startsAt = b.start ? new Date(b.start) : null;
      const endsAt = b.end ? new Date(b.end) : null;
      if (!startsAt || isNaN(startsAt.getTime())) return json(res, 400, { error: "invalid_slot" });

      // The fee is the ADVOCATE'S configured consultation fee and nothing else.
      // A UPI id is no longer consulted: money does not move through this flow,
      // so whether the advocate has published a VPA has no bearing on whether a
      // booking can be made or what is owed. `booking_type` still accepts
      // "custom" so historical rows and any older client keep working, but the
      // amount always comes from the profile — a visitor typing their own
      // number made sense only when they were pre-paying it.
      const bookingType = b.booking_type === "custom" ? "custom" : "consultation";
      const amountInr = pro && profile.payment ? Number(profile.payment.consultation_fee) || null : null;
      const paymentStatus = amountInr ? "due" : "not_required";

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
          // Left NULL on every new booking. payment_provider records who
          // vouched for money arriving, and at creation nobody has -- it is set
          // only if the advocate later marks the fee received. The 'pending'
          // branch that used to sit here could never fire again: nothing writes
          // that state now.
          payment_provider: null,
          is_pro_booking: pro,
        },
        prefer: "return=representation",
      });

      trackEvent(profile.id, "appointment", req.headers["referer"]).catch(() => {});

      // Every booking alerts the advocate immediately and lands in their
      // calendar, because the booking is final the moment it is made -- there
      // is no payment step left to wait on.
      //
      // AWAITED, NOT FIRE-AND-FORGET, and that is not a style preference.
      //
      // These were floating promises until 2026-08-29 and the platform ate
      // them. Proven from Vercel's own runtime log for a real booking: the
      // appointment INSERT logged its 201, then three further requests logged
      // their "->" and never a "<-" -- analytics, the owner's phone lookup and
      // the calendar connection all began and were killed. Once res.end() runs,
      // Vercel may freeze or recycle the instance immediately; work not yet
      // awaited simply never happens. It is worse than a clean failure because
      // a warm instance sometimes DOES finish, so it appears to work
      // intermittently.
      //
      // allSettled, so one channel's rejection cannot affect another and the
      // combined promise never rejects. Each channel still contains its own
      // errors internally, so nothing here can turn a written booking into an
      // error the visitor sees -- the row already exists at this point either
      // way. The cost is a slower POST; the alternative is notifications that
      // silently do not fire, which is the bug being fixed.
      await Promise.allSettled([
        notifyOwnerOfBooking(profile, saved),
        gcalCreateEvent(profile, saved),
      ]);

      // No pay_link and no pay_url: nothing is payable through VakilCard.
      // amount_due is information for the visitor, not a checkout.
      return json(res, 200, {
        ok: true,
        id: saved.id,
        payment_status: paymentStatus,
        amount_due: amountInr,
      });
    }

    // ---- POST {action:"confirm_payment"} — RETIRED 2026-08-29 ------------
    //
    // This set payment_status to 'claimed_paid' on the strength of a visitor
    // tapping "I've paid". That is not evidence of anything, and the state it
    // wrote looked exactly like a verified one to every screen that read it --
    // worse than having no state at all. Under pay-at-appointment there is
    // nothing for a visitor to report: the booking is already final and the fee
    // is settled in person.
    //
    // The branch is kept, and answers rather than mutating, only because a
    // cached copy of the card bundle may still post here. Removing it outright
    // would let those requests fall through to the owner-auth gate and come
    // back "unauthenticated" -- the same misleading 401 that hid the dispatch
    // bug in f10f1a5 for months. It never touches a row.
    if (req.method === "POST" && action === "confirm_payment") {
      return json(res, 410, {
        error: "payment_confirmation_retired",
        message: "Appointments are confirmed on the slot. The fee is paid directly to the advocate at the appointment.",
      });
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
      const [requests, connRows, caselinx, choices, cardLink] = await Promise.all([
        db(`vakilcard_appointment_requests?profile_id=eq.${profile.id}&select=*&order=created_at.desc&limit=100`),
        db(`vakilcard_calendar_connections?profile_id=eq.${profile.id}&select=profile_id`),
        // Same Vakilpedia account in CaseLinx (founder, 6 Oct 2026): joined? bookings sync on?
        // Never breaks the dashboard -- null just hides the CaseLinx card.
        db("rpc/vakilcard_caselinx_status", { method: "POST", body: { p_account_id: profile.account_id } })
          .catch(() => null),
        // Which calendar appointments go into -- shown in the slot builder (founder, 6 Oct 2026).
        calendarChoices(profile.account_id),
        cardLinkAllowed(profile.account_id),
      ]);
      return json(res, 200, {
        pro,
        windows: sanitizeBookingWindows(profile.booking_windows),
        buffer_minutes: profile.booking_buffer_minutes || 0,
        min_notice_hours: profile.booking_min_notice_hours != null ? profile.booking_min_notice_hours : 4,
        calendar_platform_configured: calendarConfigured(),
        calendar_connected: connRows.length > 0,
        requests,
        caselinx: caselinx && typeof caselinx === "object" && !Array.isArray(caselinx) ? caselinx : null,
        calendar: {
          source: profile.calendar_source === "caselinx" ? "caselinx" : "vakilcard",
          firm_id: profile.calendar_firm_id || null,
          caselinx_choices: choices,
          card_link: !!cardLink,
        },
      });
    }

    // Pick the calendar appointments go into (slot builder switcher). Pro only; a CaseLinx
    // workspace calendar also needs the VakilCard-CaseLinx connection.
    if (req.method === "POST" && action === "set_calendar_source") {
      if (!requirePro(res, profile, "booking")) return;
      const b = await readJsonBody(req);
      if (b.source === "caselinx") {
        const firmId = String(b.firm_id || "");
        const choices = await calendarChoices(profile.account_id);
        const pick = choices.find((c) => c.firm_id === firmId);
        if (!pick) return json(res, 400, { error: "unknown_workspace" });
        if (!pick.connected) return json(res, 409, { error: "calendar_not_connected_in_caselinx" });
        if (!(await cardLinkAllowed(profile.account_id)))
          return json(res, 402, { error: "card_link_required", feature: "card_link" });
        await db(`vakilcard_profiles?id=eq.${profile.id}`, {
          method: "PATCH",
          body: { calendar_source: "caselinx", calendar_firm_id: firmId },
          prefer: "return=minimal",
        });
        return json(res, 200, { ok: true, source: "caselinx", firm_id: firmId });
      }
      await db(`vakilcard_profiles?id=eq.${profile.id}`, {
        method: "PATCH",
        body: { calendar_source: "vakilcard", calendar_firm_id: null },
        prefer: "return=minimal",
      });
      return json(res, 200, { ok: true, source: "vakilcard", firm_id: null });
    }

    // Make a one-client booking link. FREE for every card (founder, 9 Oct 2026): it only needs weekly
    // hours and a connected Google Calendar (the meeting link is made in it), so we say so now rather
    // than send a client a link that cannot book. Reusable links are Pro.
    if (req.method === "POST" && action === "create_link") {
      const b = await readJsonBody(req);
      const reusable = !!b.reusable;
      if (reusable && !requirePro(res, profile, "booking")) return;
      const clientName = str(b.client_name, 120);
      if (!clientName && !reusable) return json(res, 400, { error: "name_required" });
      // The lawyer may pick his own times for this link (even outside his weekly hours); then no weekly hours are needed.
      const custom = cleanCustomWindows(b.custom_windows).filter((w) => new Date(w.end).getTime() > Date.now() && new Date(w.start).getTime() < Date.now() + MAX_AHEAD_MS);
      if (Array.isArray(b.custom_windows) && b.custom_windows.length && !custom.length) return json(res, 400, { error: "bad_windows" });
      const fee = cleanFee(b.fee_inr);
      if (!fee.ok) return json(res, 400, { error: "bad_fee" });
      if (!custom.length && !sanitizeBookingWindows(profile.booking_windows).length) return json(res, 409, { error: "no_hours" });
      const access = await calendarAccess(profile);
      if (!access) return json(res, 409, { error: "calendar_not_connected" });
      if (!access.canWrite) return json(res, 409, { error: "reconnect_required" });
      const prov = meeting.pickProvider(b.provider);
      const token = newToken(9);
      const [row] = await db("vakilcard_booking_links", {
        method: "POST",
        body: {
          profile_id: profile.id,
          token,
          client_name: clientName,
          client_phone: str(b.client_phone, 20),
          client_email: str(b.client_email, 160),
          purpose: str(b.purpose, 300),
          meeting_provider: prov.key,
          duration_minutes: DURATIONS.includes(Number(b.duration_minutes)) ? Number(b.duration_minutes) : null,
          reusable,
          ...(custom.length ? { custom_windows: custom } : {}),
          ...fee.patch,
          ...(reusable
            ? { expires_at: new Date(Date.now() + 90 * 86400000).toISOString() }
            : custom.length
              ? { expires_at: custom[custom.length - 1].end > new Date(Date.now() + 7 * 86400000).toISOString() ? custom[custom.length - 1].end : new Date(Date.now() + 7 * 86400000).toISOString() }
              : {}),
        },
        prefer: "return=representation",
      });
      return json(res, 200, {
        ok: true,
        token,
        url: `${LINK_SITE}/${profile.username}?book=${token}`,
        expires_at: row && row.expires_at,
        meeting: prov.label,
        advocate: profile.full_name || null,
      });
    }

    if (req.method === "POST" && action === "save_windows") {
      // Weekly hours are FREE (founder, 9 Oct 2026): they power booking links for everyone. What stays
      // Pro is clients booking straight from the card's Book button (public_slots / request).
      const b = await readJsonBody(req);
      const windows = sanitizeBookingWindows(b.windows);
      const patch = { booking_windows: windows };
      if (BUFFERS.includes(Number(b.buffer_minutes))) patch.booking_buffer_minutes = Number(b.buffer_minutes);
      if (NOTICES.includes(Number(b.min_notice_hours))) patch.booking_min_notice_hours = Number(b.min_notice_hours);
      await db(`vakilcard_profiles?id=eq.${profile.id}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
      return json(res, 200, {
        ok: true,
        windows,
        buffer_minutes: patch.booking_buffer_minutes != null ? patch.booking_buffer_minutes : profile.booking_buffer_minutes || 0,
        min_notice_hours: patch.booking_min_notice_hours != null ? patch.booking_min_notice_hours : profile.booking_min_notice_hours != null ? profile.booking_min_notice_hours : 4,
      });
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

      // The advocate recording that the fee reached them. This is the ONLY
      // way payment_status ever becomes 'confirmed', because the advocate is
      // the only party who can see the money. 'pending' and 'claimed_paid' stay
      // accepted so historical rows from the retired prepaid flow can still be
      // closed out.
      if (b.op === "confirm_payment_received") {
        if (!["due", "pending", "claimed_paid"].includes(target.payment_status))
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
      // THE PREPAID GATE IS GONE, and removing it is the point of this model.
      //
      // It used to refuse to confirm an appointment until payment_status was
      // 'confirmed', which was correct while the fee was supposed to arrive
      // BEFORE the slot. Under pay-at-appointment the fee arrives AFTER
      // confirmation by definition, so leaving the gate would make every
      // fee-bearing booking permanently unconfirmable — the advocate would
      // click Confirm and get "payment_not_confirmed" forever.
      //
      // Money and scheduling are now independent: `status` is whether the
      // appointment is happening, `payment_status` is whether the fee has
      // reached the advocate. Neither blocks the other.
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
