// Which Google Calendar a Pro card's appointments use (founder, 6 Oct 2026).
//
//   'vakilcard' (default) -> the calendar connected inside VakilCard
//                            (vakilcard_calendar_connections, booking.js OAuth).
//   'caselinx'            -> the calendar of one of the lawyer's CaseLinx workspaces, firm or
//                            personal -- the calendar CaseLinx puts hearings in, so hearings and
//                            appointments show together. Needs the Rs100/month VakilCard-CaseLinx
//                            connection (bundle CARD / ULTRA), open to everyone while the admin
//                            "Paid plans" switch is OFF (same rule as Pro itself).
//
// The CaseLinx Google connection never leaves CaseLinx: we ask its internal route for a short-lived
// access token, proving we are VakilCard's server with an HMAC under the shared
// VAKILPEDIA_AUTH_SECRET (CaseLinx: src/app/api/internal/vakilcard-calendar/route.ts).
const crypto = require("crypto");
const { db } = require("./_lib");
const { primePaidPlans } = require("./_entitlements");

// Own variable on purpose: CASELINX_ORIGIN (auth.js) may point at beta; this must reach production.
const CASELINX_ORIGIN = (process.env.CASELINX_INTERNAL_ORIGIN || "https://caselinx.vakilpedia.com").replace(/\/+$/, "");

/** CaseLinx workspaces (firm + personal) for this account, with whether Google is connected there. */
async function calendarChoices(accountId) {
  if (!accountId) return [];
  try {
    const r = await db("rpc/vakilcard_calendar_choices", { method: "POST", body: { p_account_id: accountId } });
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

/** Does this account hold the VakilCard-CaseLinx connection (or is everything open in beta)? */
async function cardLinkAllowed(accountId) {
  const live = await primePaidPlans();
  if (!live) return true;
  if (!accountId) return false;
  try {
    const s = await db("rpc/vakilcard_caselinx_status", { method: "POST", body: { p_account_id: accountId } });
    return !!(s && s.card_link);
  } catch {
    return false;
  }
}

/** Short-lived access to a CaseLinx workspace's calendar, or null. Never throws. */
async function caselinxCalendarAccess(accountId, firmId) {
  const secret = process.env.VAKILPEDIA_AUTH_SECRET || "";
  if (!secret || !accountId || !firmId) return null;
  const ts = String(Date.now());
  const sig = crypto.createHmac("sha256", secret).update(`${accountId}.${firmId}.${ts}`).digest("hex");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`${CASELINX_ORIGIN}/api/internal/vakilcard-calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, firmId, ts, sig }),
      signal: ctl.signal,
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || !data.ok || !data.access_token) {
      console.error(`[vakilcard/calendar] caselinx access refused firm=${firmId} status=${r.status} ${data && data.error}`);
      return null;
    }
    return { token: data.access_token, calendarId: data.calendar_id || "primary", email: data.account_email || null };
  } catch (e) {
    console.error(`[vakilcard/calendar] caselinx access failed firm=${firmId}:`, e && e.message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

module.exports = { calendarChoices, cardLinkAllowed, caselinxCalendarAccess, CASELINX_ORIGIN };
