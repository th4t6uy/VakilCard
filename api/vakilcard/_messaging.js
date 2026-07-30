// MessagingService — the single messaging gateway for every Vakilpedia
// product (VakilCard, CaseLinx, CourtQue, appointments, ...).
//
// Rules:
//  * No product calls Meta (or any vendor) directly — vendor specifics live
//    ONLY in the provider objects below.
//  * Every message is template-driven (message_templates registry) and
//    logged (message_log) with its product module.
//  * Modules: authentication | utility | notification | reminder | marketing
//    (extend freely — it's a tag, not an enum).
const { db } = require("./_lib");

/* ---------------- providers (vendor-specific, swappable) ---------------- */

/** Meta WhatsApp Business API. Payload shapes proven in backend/whatsapp.py. */
const WhatsAppProvider = {
  name: "whatsapp",
  /** Authentication-category template (code in body + copy/url button). */
  async deliverCode({ phoneE164, code, templateRef, language = "en" }) {
    const phoneId = process.env.WA_PHONE_ID;
    const token = process.env.WA_TOKEN;
    if (!phoneId || !token) return { ok: false, error: "whatsapp_not_configured" };
    const to = phoneE164.replace(/^\+/, "");
    const build = (buttonSubType) => ({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateRef,
        language: { code: language },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          { type: "button", sub_type: buttonSubType, index: 0, parameters: [{ type: "text", text: code }] },
        ],
      },
    });
    let lastError = "unknown";
    for (const sub of ["COPY_CODE", "URL"]) {
      try {
        const r = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(build(sub)),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok)
          return { ok: true, providerMessageId: data.messages && data.messages[0] && data.messages[0].id };
        lastError = (data.error && data.error.message) || `http_${r.status}`;
      } catch (e) {
        lastError = e.message;
      }
    }
    return { ok: false, error: lastError };
  },
  /** Utility/notification/marketing template with plain body variables. */
  async deliverTemplate({ phoneE164, templateRef, language = "en", bodyParams = [] }) {
    const phoneId = process.env.WA_PHONE_ID;
    const token = process.env.WA_TOKEN;
    if (!phoneId || !token) return { ok: false, error: "whatsapp_not_configured" };
    try {
      const r = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phoneE164.replace(/^\+/, ""),
          type: "template",
          template: {
            name: templateRef,
            language: { code: language },
            components: bodyParams.length
              ? [{ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: String(t) })) }]
              : [],
          },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok)
        return { ok: true, providerMessageId: data.messages && data.messages[0] && data.messages[0].id };
      return { ok: false, error: (data.error && data.error.message) || `http_${r.status}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};

/** Dev/test provider: nothing leaves the process. */
const ConsoleProvider = {
  name: "console",
  async deliverCode({ phoneE164, code }) {
    console.log(`[messaging:console] ${phoneE164} -> ${code}`);
    return { ok: true, providerMessageId: "console" };
  },
  async deliverTemplate({ phoneE164, templateRef, bodyParams }) {
    console.log(`[messaging:console] template ${templateRef}(${(bodyParams || []).join(",")}) -> ${phoneE164}`);
    return { ok: true, providerMessageId: "console" };
  },
};

const PROVIDERS = { whatsapp: WhatsAppProvider, console: ConsoleProvider };
function activeProvider() {
  return PROVIDERS[process.env.VERIFICATION_PROVIDER || "whatsapp"] || WhatsAppProvider;
}

/* ---------------- registry + log + pricing ---------------- */

async function getTemplate(name) {
  const rows = await db(`message_templates?name=eq.${encodeURIComponent(name)}&active=eq.true`);
  return rows[0] || null;
}

// Meta per-message rates (INR) from wa_pricing_rates; cached 10 min.
// Fallbacks keep sends working if the table is unreachable.
const FALLBACK_RATES = { authentication: 0.115, utility: 0.115, marketing: 0.7846, service: 0 };
let _ratesCache = { at: 0, rates: null };
async function getRates() {
  if (_ratesCache.rates && Date.now() - _ratesCache.at < 600000) return _ratesCache.rates;
  try {
    const rows = await db("wa_pricing_rates?select=category,rate_inr");
    const rates = { ...FALLBACK_RATES };
    for (const r of rows) rates[r.category] = Number(r.rate_inr);
    _ratesCache = { at: Date.now(), rates };
    return rates;
  } catch {
    return FALLBACK_RATES;
  }
}

async function logMessage(fields) {
  try {
    await db("message_log", { method: "POST", body: fields, prefer: "return=minimal" });
  } catch {
    /* logging must never break a flow */
  }
}

/* ---------------- public API ---------------- */

/**
 * Send a templated message.
 *  - `product`  — which Vakilpedia product is sending (vakilcard | courtque | caselinx | ...)
 *  - `module`   — purpose tag (authentication, utility, notification, reminder, marketing, ...)
 * Category (Meta pricing class) comes from the template registry; estimated
 * cost is snapshotted into message_log so the admin dashboard needs no joins.
 * Auth codes pass `code`; everything else passes `bodyParams`.
 */
async function send({ product = "vakilcard", module, templateName, phoneE164, bodyParams = [], code = null, accountId = null }) {
  const provider = activeProvider();
  const tpl = await getTemplate(templateName);
  if (!tpl) {
    await logMessage({
      account_id: accountId, phone_e164: phoneE164, template_name: templateName, module,
      product, category: module === "authentication" ? "authentication" : "utility",
      estimated_cost_inr: 0,
      variables: { bodyParams }, provider: provider.name, status: "skipped",
      error: "template_missing_or_inactive",
    });
    return { ok: false, error: "template_missing" };
  }
  const category = tpl.category || (code ? "authentication" : "utility");
  const rates = await getRates();
  const result = code
    ? await provider.deliverCode({ phoneE164, code, templateRef: tpl.provider_ref, language: tpl.language })
    : await provider.deliverTemplate({ phoneE164, templateRef: tpl.provider_ref, language: tpl.language, bodyParams });
  await logMessage({
    account_id: accountId, phone_e164: phoneE164, template_name: templateName, module,
    product, category,
    estimated_cost_inr: result.ok ? rates[category] ?? 0 : 0,
    language: tpl.language, variables: { bodyParams }, provider: provider.name,
    provider_message_id: result.providerMessageId || null,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : String(result.error).slice(0, 500),
  });
  return result;
}

/* ---------------- facade (stable product-facing API) ---------------- */

/** Utility/notification/marketing template send. */
async function sendTemplate({ product, templateName, phoneE164, bodyParams = [], accountId = null, module = "utility" }) {
  return send({ product, module, templateName, phoneE164, bodyParams, accountId });
}

/**
 * Free-form session text (only valid inside the 24-h customer service window;
 * category "service" — costs nothing). Logged like every other message.
 */
async function sendText({ product = "vakilcard", phoneE164, text, accountId = null }) {
  const provider = activeProvider();
  let result;
  if (provider.name !== "whatsapp") {
    console.log(`[messaging:console] text -> ${phoneE164}: ${String(text).slice(0, 120)}`);
    result = { ok: true, providerMessageId: "console" };
  } else {
    const phoneId = process.env.WA_PHONE_ID;
    const token = process.env.WA_TOKEN;
    if (!phoneId || !token) result = { ok: false, error: "whatsapp_not_configured" };
    else {
      try {
        const r = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phoneE164.replace(/^\+/, ""),
            type: "text",
            text: { body: text, preview_url: false },
          }),
        });
        const data = await r.json().catch(() => ({}));
        result = r.ok
          ? { ok: true, providerMessageId: data.messages && data.messages[0] && data.messages[0].id }
          : { ok: false, error: (data.error && data.error.message) || `http_${r.status}` };
      } catch (e) {
        result = { ok: false, error: e.message };
      }
    }
  }
  await logMessage({
    account_id: accountId, phone_e164: phoneE164, template_name: "_session_text", module: "session",
    product, category: "service", estimated_cost_inr: 0,
    variables: {}, provider: provider.name,
    provider_message_id: result.providerMessageId || null,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : String(result.error).slice(0, 500),
  });
  return result;
}

/** Authentication code (Meta auth-category template). */
async function sendOTP({ product = "vakilcard", phoneE164, code, accountId = null, templateName = "phone_verification_code" }) {
  return send({ product, module: "authentication", templateName, phoneE164, code, accountId });
}

/** Post-verification welcome with the permanent card link ({{1}}). */
async function sendWelcome({ product = "vakilcard", phoneE164, cardUrl, accountId = null }) {
  return send({ product, module: "utility", templateName: "vakilcard_welcome", phoneE164, bodyParams: [cardUrl], accountId });
}

module.exports = { send, sendTemplate, sendText, sendOTP, sendWelcome, activeProvider, getTemplate };
