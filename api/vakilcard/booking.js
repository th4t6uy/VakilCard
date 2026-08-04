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
//
// No gateway webhook exists for upi:// deep links, so payment confirmation
// is honestly two-step: the visitor self-reports (payment_status:
// "claimed_paid"), then the owner manually confirms having received it
// (payment_status: "confirmed") before the booking can be marked confirmed.
// This is never faked as automatic verification.
const { db, readJsonBody, resolveAccount, trackEvent, sanitizeBookingWindows, expandBookingSlots } = require("./_lib");
const { isProActive, requirePro } = require("./_entitlements");
const { sign, verify } = require("./_jwt");

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
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
// are set. No fake/simulated connection is ever created. Scope is the
// minimum needed to read free/busy — never full calendar read/write.
const GCAL_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const GCAL_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const GCAL_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || "";
const GCAL_DASHBOARD_SITE = process.env.VAKILCARD_DASHBOARD_URL || "https://vakilcard.vakilpedia.com";
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

function calendarConfigured() {
  return !!(GCAL_CLIENT_ID && GCAL_CLIENT_SECRET && GCAL_REDIRECT_URI);
}

function notConfigured(res) {
  return json(res, 503, {
    error: "calendar_not_configured",
    message: "Google Calendar isn't set up on this deployment yet. Contact the founder to enable it.",
  });
}

async function gcalExchangeCode(code) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
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
  const r = await fetch("https://oauth2.googleapis.com/token", {
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
    const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
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
      `&select=id,subscription_plan,subscription_status,subscription_expires_at,booking_windows,vakilcard_payment_prefs(*)`
  );
  const p = rows[0];
  if (!p) return null;
  p.payment = Array.isArray(p.vakilcard_payment_prefs) ? p.vakilcard_payment_prefs[0] || null : null;
  delete p.vakilcard_payment_prefs;
  return p;
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
    const action = String(req.query.action || "");

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

    // ---- GET ?action=gcal_callback — Google's own redirect, no auth ------
    if (req.method === "GET" && action === "gcal_callback") {
      if (!calendarConfigured()) return notConfigured(res);
      const redirectBack = (ok, msg) => {
        res.statusCode = 302;
        res.setHeader("Location", `${GCAL_DASHBOARD_SITE}/setup?s=payment&gcal=${ok ? "connected" : "error"}${msg ? "&msg=" + encodeURIComponent(msg) : ""}`);
        res.end();
      };
      try {
        const claims = verify(String(req.query.state || ""));
        if (!claims || claims.typ !== "gcal_state" || !claims.pid) return redirectBack(false, "expired_state");
        const code = String(req.query.code || "");
        if (!code) return redirectBack(false, req.query.error || "no_code");
        const t = await gcalExchangeCode(code);
        if (!t.refresh_token) {
          return redirectBack(false, "no_refresh_token_reconnect_required");
        }
        const expires_at = new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString();
        await db("vakilcard_calendar_connections?on_conflict=profile_id", {
          method: "POST",
          body: {
            profile_id: claims.pid,
            provider: "google",
            access_token: t.access_token,
            refresh_token: t.refresh_token,
            token_expires_at: expires_at,
            calendar_id: "primary",
          },
          prefer: "resolution=merge-duplicates,return=minimal",
        });
        return redirectBack(true);
      } catch (e) {
        return redirectBack(false, "exchange_failed");
      }
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
          is_pro_booking: pro,
        },
        prefer: "return=representation",
      });

      trackEvent(profile.id, "appointment", req.headers["referer"]).catch(() => {});

      return json(res, 200, {
        ok: true,
        id: saved.id,
        payment_status: paymentStatus,
        pay_link: payLink,
        amount_inr: amountInr,
      });
    }

    // ---- POST {action:"confirm_payment"} — no auth, visitor self-report -
    if (req.method === "POST" && action === "confirm_payment") {
      const b = await readJsonBody(req);
      const id = str(b.request_id, 100);
      if (!id) return json(res, 400, { error: "request_id_required" });
      const rows = await db(`vakilcard_appointment_requests?id=eq.${encodeURIComponent(id)}&select=id,profile_id,payment_status`);
      const reqRow = rows[0];
      if (!reqRow) return json(res, 404, { error: "not_found" });
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
