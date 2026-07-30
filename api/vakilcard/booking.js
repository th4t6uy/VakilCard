// VakilCard appointment booking (Pro) — entitlement-gated from day one.
//   GET  /api/vakilcard/booking → booking configuration (owner, Pro only)
//   POST /api/vakilcard/booking → save booking configuration (owner, Pro only)
// Free users receive the uniform 402 pro_required — the response never
// describes the premium functionality.
//
// Scheduling backend (Google Calendar slots, public booking page,
// reminders) ships next; the entitlement wall and API shape are final so
// the frontend and billing integrate now without rework.
const { db, readJsonBody, resolveAccount } = require("./_lib");
const { requirePro } = require("./_entitlements");

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  try {
    const who = await resolveAccount(req);
    if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
    const rows = await db(
      `vakilcard_profiles?account_id=eq.${who.accountId}&select=id,subscription_plan,subscription_status,subscription_expires_at`
    );
    const profile = rows[0];
    if (!profile) return json(res, 404, { error: "no_profile" });
    if (!requirePro(res, profile, "booking")) return;

    if (req.method === "GET")
      return json(res, 200, { configured: false, coming_soon: true, google_calendar_connected: false });
    if (req.method === "POST") {
      await readJsonBody(req); // shape reserved
      return json(res, 501, { error: "coming_soon" });
    }
    return json(res, 405, { error: "method_not_allowed" });
  } catch {
    return json(res, 500, { error: "server_error" });
  }
};
