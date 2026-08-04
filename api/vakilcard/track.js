// Analytics beacon for VakilCard public pages + onboarding funnel.
// Fire-and-forget via navigator.sendBeacon; inserts are best-effort and
// validated against the same whitelist enforced by the DB check constraint.
// Funnel events (cta_click, otp_started, ...) may have no profile yet.
const { readJsonBody, trackEvent } = require("./_lib");

const PROFILE_EVENTS = new Set([
  "view", "share", "call", "whatsapp", "email", "pay", "directions",
  "save_contact", "appointment", "website", "qr_download", "social_click",
  "draft_created", "profile_25", "profile_50", "profile_75", "published",
  "nfc_tap", "google_review", "payment_claimed",
]);
const FUNNEL_EVENTS = new Set(["cta_click", "otp_started", "otp_verified"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  const body = await readJsonBody(req);
  const pid = body.profile_id ? String(body.profile_id) : null;
  const ev = String(body.event_type || "");
  const referrer = req.headers["referer"];
  if (pid && UUID_RE.test(pid) && PROFILE_EVENTS.has(ev)) {
    await trackEvent(pid, ev, referrer);
  } else if (!pid && FUNNEL_EVENTS.has(ev)) {
    await trackEvent(null, ev, referrer);
  }
  res.statusCode = 204;
  res.end();
};
