// Email delivery for VakilCard — Resend over plain HTTPS.
//
// No SDK: one endpoint, one POST, auditable in twenty lines. Same rationale as
// _razorpay.js's hand-rolled fetch wrapper.
//
// INERT BY DEFAULT. With RESEND_API_KEY unset every call is a no-op that logs
// 'skipped' and returns { ok:false }. Nothing that calls this may treat a
// failure as fatal — an advocate's booking is not contingent on their email
// arriving.
//
// SETUP OWED (founder, one time):
//   1. Create the API key in the Resend dashboard.
//   2. Verify a sending domain and add the SPF + DKIM records to the
//      vakilpedia.com DNS zone (Hostinger). Sending from an unverified domain
//      lands in spam or is rejected outright by Gmail — which is where these
//      advocates read their mail.
//   3. Set RESEND_API_KEY and VAKILCARD_EMAIL_FROM in the Vercel project.
// The key must be pasted by the founder; an agent does not handle credentials.
const { db } = require("./_lib");

const RESEND_API = "https://api.resend.com/emails";

function configured() {
  return !!process.env.RESEND_API_KEY;
}

/** Never throws. Logs to message_log so email sits beside WhatsApp in the
 *  admin view rather than in a separate blind spot. */
async function sendEmail({ to, subject, text, html, product = "vakilcard", accountId = null, label = "_booking_email" }) {
  const from = process.env.VAKILCARD_EMAIL_FROM || "VakilCard <noreply@vakilpedia.com>";
  let result;

  if (!configured()) {
    result = { ok: false, error: "resend_not_configured" };
  } else if (!to) {
    result = { ok: false, error: "no_recipient" };
  } else {
    try {
      const r = await fetch(RESEND_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
      });
      const data = await r.json().catch(() => ({}));
      result = r.ok
        ? { ok: true, providerMessageId: data.id || null }
        : { ok: false, error: (data.message || data.name || `http_${r.status}`) };
      if (!r.ok) console.error(`[vakilcard/email] resend ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
    } catch (e) {
      result = { ok: false, error: e.message };
    }
  }

  try {
    await db("message_log", {
      method: "POST",
      body: {
        account_id: accountId,
        phone_e164: null,
        template_name: label,
        module: "notification",
        product,
        category: "utility",
        estimated_cost_inr: 0,
        variables: { to, subject },
        provider: "resend",
        provider_message_id: result.providerMessageId || null,
        status: result.ok ? "sent" : "skipped",
        error: result.ok ? null : String(result.error).slice(0, 500),
      },
      prefer: "return=minimal",
    });
  } catch {
    /* logging must never break a flow */
  }
  return result;
}

module.exports = { configured, sendEmail };
