// Phone-verification pipeline for VakilCard — provider-agnostic by design.
//
// The product concept is "WhatsApp Phone Verification", NOT "WhatsApp OTP".
// Delivery goes through the shared MessagingService (_messaging.js); this
// module owns only session lifecycle, hashing, rate limiting and auditing.
// Nothing here (or anywhere outside _messaging.js providers) knows about Meta.
const crypto = require("crypto");
const { db } = require("./_lib");
const { hashCode } = require("./_jwt");
const messaging = require("./_messaging");

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between sends
const MAX_SESSIONS_PER_PHONE_PER_HOUR = 5;
const MAX_SESSIONS_PER_IP_PER_HOUR = 15;

/** Normalize to E.164. Bare 10-digit numbers default to India (+91). */
function normalizePhone(raw) {
  let s = String(raw || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    const digits = s.replace(/\D/g, "");
    if (digits.length === 10 && /^[6-9]/.test(digits)) s = "+91" + digits;
    else if (digits.length === 12 && digits.startsWith("91")) s = "+" + digits;
    else s = "+" + digits;
  }
  return /^\+[1-9][0-9]{6,14}$/.test(s) ? s : null;
}

async function audit(event, { accountId = null, phoneE164 = null, ip = null, meta = {} } = {}) {
  try {
    await db("identity_audit_log", {
      method: "POST",
      body: { account_id: accountId, event, phone_e164: phoneE164, ip, meta },
      prefer: "return=minimal",
    });
  } catch {
    /* auditing must never break the flow */
  }
}

function genCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function recentSessions(filter) {
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  return db(
    `verification_sessions?${filter}&created_at=gte.${encodeURIComponent(oneHourAgo)}&select=id,last_sent_at,resend_count,status,created_at&order=created_at.desc`
  );
}

/**
 * Start (or reuse) a verification session and deliver a code.
 * Returns { ok, sessionId?, error?, retryAfterSec? }
 */
async function sendVerification({ phone, ip, userAgent, deviceFingerprint }) {
  const phoneE164 = normalizePhone(phone);
  if (!phoneE164) return { ok: false, error: "invalid_phone" };

  const byPhone = await recentSessions(`phone_e164=eq.${encodeURIComponent(phoneE164)}`);
  if (byPhone.length >= MAX_SESSIONS_PER_PHONE_PER_HOUR) {
    await audit("verification_rate_limited", { phoneE164, ip, meta: { scope: "phone" } });
    return { ok: false, error: "rate_limited", retryAfterSec: 3600 };
  }
  if (ip) {
    const byIp = await recentSessions(`ip=eq.${encodeURIComponent(ip)}`);
    if (byIp.length >= MAX_SESSIONS_PER_IP_PER_HOUR) {
      await audit("verification_rate_limited", { phoneE164, ip, meta: { scope: "ip" } });
      return { ok: false, error: "rate_limited", retryAfterSec: 3600 };
    }
  }
  const latest = byPhone[0];
  if (latest && latest.last_sent_at && Date.now() - new Date(latest.last_sent_at).getTime() < RESEND_COOLDOWN_MS) {
    return {
      ok: false,
      error: "cooldown",
      retryAfterSec: Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - new Date(latest.last_sent_at).getTime())) / 1000),
    };
  }

  const code = genCode();
  const provider = messaging.activeProvider();
  const [session] = await db("verification_sessions", {
    method: "POST",
    body: {
      phone_e164: phoneE164,
      code_hash: hashCode(code, phoneE164),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      max_attempts: MAX_ATTEMPTS,
      last_sent_at: new Date().toISOString(),
      ip: ip || null,
      user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
      device_fingerprint: deviceFingerprint ? String(deviceFingerprint).slice(0, 200) : null,
      provider: provider.name,
    },
    prefer: "return=representation",
  });
  await audit("verification_requested", { phoneE164, ip, meta: { session_id: session.id, provider: provider.name } });

  const sent = await messaging.send({
    module: "authentication",
    templateName: "phone_verification_code",
    phoneE164,
    code,
  });

  if (!sent.ok) {
    await db(`verification_sessions?id=eq.${session.id}`, {
      method: "PATCH",
      body: { status: "expired" },
      prefer: "return=minimal",
    });
    await audit("verification_send_failed", { phoneE164, ip, meta: { error: sent.error } });
    return { ok: false, error: "delivery_failed" };
  }
  await audit("verification_sent", { phoneE164, ip, meta: { session_id: session.id } });
  return { ok: true, sessionId: session.id, phoneE164 };
}

/**
 * Verify a code for a phone. Returns { ok, phoneE164?, error?, attemptsLeft? }.
 * Sessions are single-use and consumed on success.
 */
async function verify({ phone, code, ip }) {
  const phoneE164 = normalizePhone(phone);
  if (!phoneE164 || !/^\d{6}$/.test(String(code || ""))) return { ok: false, error: "invalid_input" };

  const sessions = await db(
    `verification_sessions?phone_e164=eq.${encodeURIComponent(phoneE164)}&status=eq.pending&order=created_at.desc&limit=1`
  );
  const s = sessions[0];
  if (!s) return { ok: false, error: "no_session" };
  if (new Date(s.expires_at).getTime() < Date.now()) {
    await db(`verification_sessions?id=eq.${s.id}`, { method: "PATCH", body: { status: "expired" }, prefer: "return=minimal" });
    return { ok: false, error: "expired" };
  }
  if (s.attempts >= s.max_attempts) {
    await db(`verification_sessions?id=eq.${s.id}`, { method: "PATCH", body: { status: "locked" }, prefer: "return=minimal" });
    await audit("verification_locked", { phoneE164, ip, meta: { session_id: s.id } });
    return { ok: false, error: "locked" };
  }

  const expected = hashCode(String(code), phoneE164);
  const match =
    expected.length === s.code_hash.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s.code_hash));

  if (!match) {
    const attempts = s.attempts + 1;
    await db(`verification_sessions?id=eq.${s.id}`, {
      method: "PATCH",
      body: { attempts, ...(attempts >= s.max_attempts ? { status: "locked" } : {}) },
      prefer: "return=minimal",
    });
    await audit("verification_failed", { phoneE164, ip, meta: { session_id: s.id, attempts } });
    return { ok: false, error: "wrong_code", attemptsLeft: Math.max(0, s.max_attempts - attempts) };
  }

  await db(`verification_sessions?id=eq.${s.id}`, {
    method: "PATCH",
    body: { status: "consumed" },
    prefer: "return=minimal",
  });
  await audit("verification_success", { phoneE164, ip, meta: { session_id: s.id } });
  return { ok: true, phoneE164 };
}

/** Resend = new code on the same rules (cooldown + hourly caps apply). */
const resend = sendVerification;

/** Status of the most recent session for a phone. */
async function status({ phone }) {
  const phoneE164 = normalizePhone(phone);
  if (!phoneE164) return { ok: false, error: "invalid_phone" };
  const sessions = await db(
    `verification_sessions?phone_e164=eq.${encodeURIComponent(phoneE164)}&order=created_at.desc&limit=1&select=status,expires_at,attempts,max_attempts,last_sent_at`
  );
  return { ok: true, session: sessions[0] || null };
}

/** Back-compat shim: non-auth templated sends now route through MessagingService. */
async function sendTemplateMessage({ phoneE164, templateName, bodyParams = [], accountId = null, module = "utility" }) {
  return messaging.send({ module, templateName, phoneE164, bodyParams, accountId });
}

module.exports = {
  normalizePhone,
  sendVerification,
  verify,
  resend,
  status,
  sendTemplateMessage,
  audit,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
};
