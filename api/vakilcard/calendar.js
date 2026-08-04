// Google Calendar connection for VakilCard Pro's "Smart" booking.
//   GET  /api/vakilcard/calendar?action=start     → owner auth, Pro only:
//        302s to Google's OAuth consent screen.
//   GET  /api/vakilcard/calendar?action=callback  → Google redirects here
//        with ?code=&state=; exchanges the code for tokens, stores them,
//        redirects the owner back to their dashboard.
//   POST /api/vakilcard/calendar {action:"disconnect"} → owner auth: removes
//        the stored connection. Booking then falls back to windows-only,
//        exactly like Free — never a broken state.
//
// INERT BY DEFAULT: every entry point 500s with a clear message until
// GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI
// are set in the environment. No fake/simulated connection is ever created.
// Scope is the minimum needed to read free/busy — never full calendar
// read/write, VakilCard never sees event titles or attendees.
const { db, resolveAccount } = require("./_lib");
const { sign, verify } = require("./_jwt");
const { requirePro } = require("./_entitlements");

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || "";
const DASHBOARD_SITE = process.env.VAKILCARD_DASHBOARD_URL || "https://vakilcard.vakilpedia.com";
const SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

function configured() {
  return !!(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function notConfigured(res) {
  return json(res, 503, {
    error: "calendar_not_configured",
    message: "Google Calendar isn't set up on this deployment yet. Contact the founder to enable it.",
  });
}

async function exchangeCode(code) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || "token_exchange_failed");
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function refreshAccessToken(refreshToken) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || "token_refresh_failed");
  return data; // { access_token, expires_in, ... } — no new refresh_token on refresh
}

/** Returns a valid access token for a profile's stored connection, or null
 *  if not connected. Refreshes + persists when the stored token has expired.
 *  Used by booking.js — never throws (a Google outage degrades to
 *  windows-only availability, it never breaks the booking page). */
async function getValidAccessToken(profileId) {
  if (!configured()) return null;
  const rows = await db(`vakilcard_calendar_connections?profile_id=eq.${profileId}&select=*`);
  const conn = rows[0];
  if (!conn) return null;
  if (new Date(conn.token_expires_at).getTime() > Date.now() + 60000) return conn.access_token;
  if (!conn.refresh_token) return null; // can't refresh — owner must reconnect
  try {
    const t = await refreshAccessToken(conn.refresh_token);
    const expires_at = new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString();
    await db(`vakilcard_calendar_connections?profile_id=eq.${profileId}`, {
      method: "PATCH",
      body: { access_token: t.access_token, token_expires_at: expires_at },
      prefer: "return=minimal",
    });
    return t.access_token;
  } catch {
    return null; // degrade to windows-only rather than 500 the booking page
  }
}

/** Free/busy ranges for the next `days` days, or [] on any failure/absence
 *  — booking.js treats [] identically to "not connected" (windows-only). */
async function freeBusy(profileId, { days = 14 } = {}) {
  const token = await getValidAccessToken(profileId);
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

/** "start" is reached via a plain top-level browser navigation (the OAuth
 *  consent redirect can't be triggered from a fetch() with a custom
 *  Authorization header) — so it accepts the access token as a query param
 *  as well as the normal header. Every other action on this handler stays
 *  header-only. The token is short-lived (1h) and this is a one-time GET
 *  the owner triggers themselves by clicking "Connect Google Calendar". */
async function resolveAccountForStart(req) {
  const viaHeader = await resolveAccount(req);
  if (viaHeader) return viaHeader;
  const token = String(req.query.token || "");
  if (!token) return null;
  const claims = verify(token);
  return claims && claims.sub ? { accountId: claims.sub } : null;
}

module.exports = async function handler(req, res) {
  if (req.method === "GET" && req.query.action === "start") {
    if (!configured()) return notConfigured(res);
    const who = await resolveAccountForStart(req);
    if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
    const rows = await db(
      `vakilcard_profiles?account_id=eq.${who.accountId}&select=id,subscription_plan,subscription_status,subscription_expires_at`
    );
    const profile = rows[0];
    if (!profile) return json(res, 404, { error: "no_profile" });
    if (!requirePro(res, profile, "booking")) return;
    const state = sign({ pid: profile.id, typ: "gcal_state" }, { expiresInSec: 600 });
    const url =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        access_type: "offline",
        prompt: "consent", // always return a refresh_token, even on reconnect
        scope: SCOPE,
        state,
      });
    res.statusCode = 302;
    res.setHeader("Location", url);
    res.end();
    return;
  }

  if (req.method === "GET" && req.query.action === "callback") {
    if (!configured()) return notConfigured(res);
    const redirectBack = (ok, msg) => {
      res.statusCode = 302;
      res.setHeader("Location", `${DASHBOARD_SITE}/setup?s=payment&gcal=${ok ? "connected" : "error"}${msg ? "&msg=" + encodeURIComponent(msg) : ""}`);
      res.end();
    };
    try {
      const claims = verify(String(req.query.state || ""));
      if (!claims || claims.typ !== "gcal_state" || !claims.pid) return redirectBack(false, "expired_state");
      const code = String(req.query.code || "");
      if (!code) return redirectBack(false, req.query.error || "no_code");
      const t = await exchangeCode(code);
      if (!t.refresh_token) {
        // Google only issues a refresh_token on first-ever consent for this
        // account+app; a bare re-click without "prompt=consent" (already
        // forced above) landing here means the owner needs to revoke access
        // at myaccount.google.com/permissions and reconnect once.
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

  if (req.method === "POST") {
    const who = await resolveAccount(req);
    if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
    const rows = await db(`vakilcard_profiles?account_id=eq.${who.accountId}&select=id`);
    const profile = rows[0];
    if (!profile) return json(res, 404, { error: "no_profile" });
    await db(`vakilcard_calendar_connections?profile_id=eq.${profile.id}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "method_not_allowed" });
};

module.exports.freeBusy = freeBusy;
module.exports.configured = configured;
