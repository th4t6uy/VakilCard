// VakilCard authentication — phone-first identity.
//   POST /api/vakilcard/auth  { action: "start",   phone, device_fingerprint? }
//   POST /api/vakilcard/auth  { action: "verify",  phone, code }
//   POST /api/vakilcard/auth  { action: "resend",  phone }
//   POST /api/vakilcard/auth  { action: "status",  phone }
//   POST /api/vakilcard/auth  { action: "refresh", refresh_token }
//   POST /api/vakilcard/auth  { action: "logout",  refresh_token }
//
// Successful verification creates the account + a DRAFT VakilCard: the
// username (phone number) and URL are reserved immediately, but nothing is
// public or indexable until the lawyer completes and publishes the card.
// Tokens: 1h access JWT + rotating 60d refresh token (see _jwt.js).
const { db, readJsonBody, resolveAccount } = require("./_lib");
const {
  sign,
  newRefreshToken,
  hashRefreshToken,
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
} = require("./_jwt");
const verification = require("./_verify");
const messaging = require("./_messaging");
const { hashPassword, verifyPassword, passwordPolicyError } = require("./_password");
const { generateAutoUsername } = require("./_usernames");

// Google sign-in (full alternative to phone — no OTP required at signup).
// A SEPARATE Google Cloud OAuth client from the Calendar-sync one in
// booking.js: this is a "Sign in with Google" (Google Identity Services)
// client scoped to the browser's origin, not an offline-access OAuth flow.
// Client ID only — there is no client secret for GIS ID-token verification,
// the token is verified by checking its signature via Google's tokeninfo
// endpoint, matching the dependency-free style of the rest of this file.
const GOOGLE_SIGNIN_CLIENT_ID = process.env.GOOGLE_SIGNIN_CLIENT_ID || "";

async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_SIGNIN_CLIENT_ID) return { ok: false, error: "google_signin_not_configured" };
  if (!idToken) return { ok: false, error: "missing_id_token" };
  let r;
  try {
    r = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
  } catch {
    return { ok: false, error: "google_unreachable" };
  }
  if (!r.ok) return { ok: false, error: "invalid_id_token" };
  const claims = await r.json().catch(() => null);
  if (!claims || claims.aud !== GOOGLE_SIGNIN_CLIENT_ID) return { ok: false, error: "invalid_id_token" };
  if (String(claims.email_verified) !== "true") return { ok: false, error: "email_not_verified" };
  if (!claims.sub) return { ok: false, error: "invalid_id_token" };
  return { ok: true, claims };
}

const SITE = "https://www.vakilpedia.com";
// Owner dashboard's own domain (cut over 2026-08-04). Separate from SITE:
// the public card stays on the root marketing domain, the dashboard is its
// own deployment/subdomain — see Apps/VakilCard/README.md.
const DASHBOARD_SITE = process.env.VAKILCARD_DASHBOARD_URL || "https://vakilcard.vakilpedia.com";

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  return xf ? String(xf).split(",")[0].trim() : req.socket && req.socket.remoteAddress;
}

/** Issue an access+refresh pair; stores only the refresh hash. */
async function issueTokens(accountId, profileId, req) {
  const refresh = newRefreshToken();
  await db("refresh_tokens", {
    method: "POST",
    body: {
      account_id: accountId,
      token_hash: hashRefreshToken(refresh),
      expires_at: new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString(),
      ip: clientIp(req) || null,
      user_agent: String(req.headers["user-agent"] || "").slice(0, 300) || null,
    },
    prefer: "return=minimal",
  });
  const access = sign({ sub: accountId, pid: profileId || null, typ: "access" });
  return { access, refresh };
}

/**
 * Stamp last_login_at + last_active_at on the account (first-party registry
 * visibility — see admin.js registry). Best-effort: registry timestamps must
 * never block or fail an authentication.
 */
async function touchLogin(accountId) {
  if (!accountId) return;
  try {
    const now = new Date().toISOString();
    await db(`vakilpedia_accounts?id=eq.${accountId}`, {
      method: "PATCH",
      body: { last_login_at: now, last_active_at: now },
      prefer: "return=minimal",
    });
  } catch {
    /* non-fatal */
  }
}

/** Default public username for a phone: national 10 digits for India, full digits otherwise. */
function phoneUsername(phoneE164) {
  const digits = phoneE164.replace(/^\+/, "");
  return digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
}

/** Find or create the account + DRAFT profile for a verified phone. Idempotent. */
async function ensureAccountForPhone(phoneE164, ip) {
  const existing = await db(
    `account_phone_identities?phone_e164=eq.${encodeURIComponent(phoneE164)}&select=account_id`
  );
  if (existing.length) {
    const accountId = existing[0].account_id;
    const profiles = await db(
      `vakilcard_profiles?account_id=eq.${accountId}&select=id,username,is_published`
    );
    return { accountId, profile: profiles[0] || null, created: false };
  }

  const [account] = await db("vakilpedia_accounts", {
    method: "POST",
    body: { registration_source: "vakilcard" },
    prefer: "return=representation",
  });
  await db("account_phone_identities", {
    method: "POST",
    body: { account_id: account.id, phone_e164: phoneE164, verified_at: new Date().toISOString() },
    prefer: "return=minimal",
  });

  let uname = phoneUsername(phoneE164);
  const clash = await db(
    `vakilcard_profiles?username=eq.${encodeURIComponent(uname)}&select=id`
  );
  const aliasClash = clash.length
    ? clash
    : await db(`vakilcard_aliases?alias=eq.${encodeURIComponent(uname)}&select=profile_id`);
  if (aliasClash.length) uname = phoneE164.replace(/^\+/, "");

  // DRAFT card: URL + username reserved now; public only after publish.
  const [profile] = await db("vakilcard_profiles", {
    method: "POST",
    body: {
      account_id: account.id,
      username: uname,
      full_name: "Advocate",
      phone: phoneE164,
      whatsapp: phoneE164,
      is_published: false,
    },
    prefer: "return=representation",
  });
  await db("vakilcard_aliases", {
    method: "POST",
    body: { alias: uname, profile_id: profile.id, kind: "phone", is_primary: true },
    prefer: "return=minimal",
  });
  await verification.audit("account_created", {
    accountId: account.id,
    phoneE164,
    ip,
    meta: { profile_id: profile.id, username: uname, draft: true },
  });

  // Welcome (template-driven): the approved Meta template `vakilcard_welcome`
  // takes exactly ONE variable — the permanent card URL. Failure (e.g.
  // template pending approval) never blocks onboarding.
  messaging
    .sendWelcome({
      product: "vakilcard",
      phoneE164,
      cardUrl: `${SITE}/${uname}`,
      accountId: account.id,
    })
    .catch(() => {});

  return { accountId: account.id, profile, created: true };
}

/** Find or create the account + DRAFT profile for a verified Google identity.
 *  Idempotent on provider_uid. No phone is attached — phone stays fully
 *  optional and is added later via link_phone_start/verify if the owner
 *  wants WhatsApp booking alerts. */
async function ensureAccountForGoogle({ sub, email, name }, ip) {
  const existing = await db(
    `account_oauth_identities?provider=eq.google&provider_uid=eq.${encodeURIComponent(sub)}&select=account_id`
  );
  if (existing.length) {
    const accountId = existing[0].account_id;
    const profiles = await db(
      `vakilcard_profiles?account_id=eq.${accountId}&select=id,username,full_name,is_published`
    );
    return { accountId, profile: profiles[0] || null, created: false };
  }

  const [account] = await db("vakilpedia_accounts", {
    method: "POST",
    body: { registration_source: "vakilcard_google" },
    prefer: "return=representation",
  });
  await db("account_oauth_identities", {
    method: "POST",
    body: {
      account_id: account.id,
      provider: "google",
      provider_uid: sub,
      email: email || null,
      display_name: name || null,
    },
    prefer: "return=minimal",
  });

  const fullName = String(name || "").slice(0, 120) || "Advocate";
  const uname = await generateAutoUsername(fullName, null, async (candidate) => {
    const clash = await db(`vakilcard_profiles?username=eq.${encodeURIComponent(candidate)}&select=id`);
    if (clash.length) return true;
    const aliasClash = await db(`vakilcard_aliases?alias=eq.${encodeURIComponent(candidate)}&select=profile_id`);
    return aliasClash.length > 0;
  });

  // DRAFT card: URL + username reserved now; public only after publish.
  const [profile] = await db("vakilcard_profiles", {
    method: "POST",
    body: {
      account_id: account.id,
      username: uname,
      created_username: uname,
      full_name: fullName,
      email: email || null,
      is_published: false,
    },
    prefer: "return=representation",
  });
  await db("vakilcard_aliases", {
    method: "POST",
    body: { alias: uname, profile_id: profile.id, kind: "custom", is_primary: true },
    prefer: "return=minimal",
  });
  await verification.audit("account_created", {
    accountId: account.id,
    ip,
    meta: { profile_id: profile.id, username: uname, draft: true, source: "google" },
  });
  // No WhatsApp welcome here — no phone attached yet. The dashboard nudges
  // the owner to add one later (unlocks WhatsApp booking alerts).

  return { accountId: account.id, profile, created: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const body = await readJsonBody(req);
  const action = String(body.action || "");
  const ip = clientIp(req);

  try {
    if (action === "start" || action === "resend") {
      const r = await verification.sendVerification({
        phone: body.phone,
        ip,
        userAgent: req.headers["user-agent"],
        deviceFingerprint: body.device_fingerprint,
      });
      if (!r.ok)
        return json(res, r.error === "rate_limited" || r.error === "cooldown" ? 429 : 400, r);
      return json(res, 200, { ok: true, phone: r.phoneE164 });
    }

    if (action === "status") {
      return json(res, 200, await verification.status({ phone: body.phone }));
    }

    if (action === "verify") {
      const r = await verification.verify({ phone: body.phone, code: body.code, ip });
      if (!r.ok) return json(res, r.error === "locked" ? 429 : 400, r);

      const { accountId, profile, created } = await ensureAccountForPhone(r.phoneE164, ip);
      const { access, refresh } = await issueTokens(accountId, profile && profile.id, req);
      await touchLogin(accountId);
      return json(res, 200, {
        ok: true,
        token: access, // back-compat field (Phase 2 clients)
        access_token: access,
        refresh_token: refresh,
        expires_in: ACCESS_TTL_SEC,
        account_id: accountId,
        created,
        username: profile ? profile.username : null,
        published: profile ? profile.is_published === true : false,
        card_url: profile ? `${SITE}/${profile.username}` : null,
        setup_url: DASHBOARD_SITE,
      });
    }

    if (action === "google_signin") {
      const v = await verifyGoogleIdToken(String(body.id_token || ""));
      if (!v.ok) return json(res, v.error === "google_signin_not_configured" ? 503 : 401, { error: v.error });
      const { sub, email, name } = v.claims;

      const { accountId, profile, created } = await ensureAccountForGoogle({ sub, email, name }, ip);
      const { access, refresh } = await issueTokens(accountId, profile && profile.id, req);
      await touchLogin(accountId);
      await verification.audit(created ? "account_created" : "google_login_success", { accountId, ip, meta: { source: "google" } });
      return json(res, 200, {
        ok: true,
        token: access,
        access_token: access,
        refresh_token: refresh,
        expires_in: ACCESS_TTL_SEC,
        account_id: accountId,
        created,
        username: profile ? profile.username : null,
        full_name: profile ? profile.full_name : name || null,
        published: profile ? profile.is_published === true : false,
        card_url: profile ? `${SITE}/${profile.username}` : null,
        setup_url: DASHBOARD_SITE,
      });
    }

    // ── Link phone to an already-authenticated account (e.g. a Google-only
    //    signup adding a number later for WhatsApp booking alerts). Reuses
    //    the same OTP pipeline as signup, but never creates a new account —
    //    it always attaches to the caller's existing account. ────────────
    if (action === "link_phone_start") {
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const r = await verification.sendVerification({
        phone: body.phone,
        ip,
        userAgent: req.headers["user-agent"],
        deviceFingerprint: body.device_fingerprint,
      });
      if (!r.ok)
        return json(res, r.error === "rate_limited" || r.error === "cooldown" ? 429 : 400, r);
      return json(res, 200, { ok: true, phone: r.phoneE164 });
    }

    if (action === "link_phone_verify") {
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const r = await verification.verify({ phone: body.phone, code: body.code, ip });
      if (!r.ok) return json(res, r.error === "locked" ? 429 : 400, r);

      const claimedBy = await db(
        `account_phone_identities?phone_e164=eq.${encodeURIComponent(r.phoneE164)}&select=account_id`
      );
      if (claimedBy.length && claimedBy[0].account_id !== who.accountId) {
        return json(res, 409, { error: "phone_already_linked" });
      }
      if (!claimedBy.length) {
        await db("account_phone_identities", {
          method: "POST",
          body: { account_id: who.accountId, phone_e164: r.phoneE164, verified_at: new Date().toISOString(), is_primary: true },
          prefer: "return=minimal",
        });
      }
      // Keep the profile's phone/whatsapp columns in sync — booking alerts
      // and every other WhatsApp-send path reads from here, not the
      // identities table directly.
      await db(`vakilcard_profiles?account_id=eq.${who.accountId}`, {
        method: "PATCH",
        body: { phone: r.phoneE164, whatsapp: r.phoneE164 },
        prefer: "return=minimal",
      });
      await verification.audit("phone_linked", { accountId: who.accountId, phoneE164: r.phoneE164, ip });
      return json(res, 200, { ok: true, phone: r.phoneE164 });
    }

    // ── Password credential ────────────────────────────────────────────
    // Password is the primary re-login credential (OTP costs money per send).
    // set_password / change_password share ONE implementation (_password.js);
    // there is no duplicate hashing anywhere in the live tree.

    if (action === "login_password") {
      const phoneE164 = verification.normalizePhone(body.phone);
      if (!phoneE164) return json(res, 400, { error: "invalid_phone" });
      const password = String(body.password || "");
      if (!password) return json(res, 400, { error: "missing_password" });

      // Lockout: 8+ failed attempts for this phone in the last 15 minutes.
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const fails = await db(
        `identity_audit_log?event=eq.password_login_failed&phone_e164=eq.${encodeURIComponent(phoneE164)}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=8`
      );
      if (fails.length >= 8) return json(res, 429, { error: "too_many_attempts" });

      const ids = await db(
        `account_phone_identities?phone_e164=eq.${encodeURIComponent(phoneE164)}&select=account_id`
      );
      const accountId = ids[0] && ids[0].account_id;
      const accounts = accountId
        ? await db(`vakilpedia_accounts?id=eq.${accountId}&select=id,password_hash,status`)
        : [];
      const account = accounts[0];

      if (!account || account.status !== "active" || !account.password_hash) {
        if (account && !account.password_hash) {
          await verification.audit("password_login_failed", { accountId, phoneE164, ip, meta: { reason: "no_password_set" } });
          return json(res, 400, { error: "no_password_set" });
        }
        // Same generic error for unknown numbers: don't leak who is registered.
        await verification.audit("password_login_failed", { phoneE164, ip, meta: { reason: "no_account" } });
        return json(res, 401, { error: "invalid_credentials" });
      }

      if (!verifyPassword(password, account.password_hash)) {
        await verification.audit("password_login_failed", { accountId, phoneE164, ip, meta: { reason: "wrong_password" } });
        return json(res, 401, { error: "invalid_credentials" });
      }

      const profiles = await db(
        `vakilcard_profiles?account_id=eq.${accountId}&select=id,username,is_published`
      );
      const profile = profiles[0] || null;
      const { access, refresh } = await issueTokens(accountId, profile && profile.id, req);
      await touchLogin(accountId);
      await verification.audit("password_login_success", { accountId, phoneE164, ip });
      return json(res, 200, {
        ok: true,
        token: access,
        access_token: access,
        refresh_token: refresh,
        expires_in: ACCESS_TTL_SEC,
        account_id: accountId,
        created: false,
        username: profile ? profile.username : null,
        published: profile ? profile.is_published === true : false,
        card_url: profile ? `${SITE}/${profile.username}` : null,
        setup_url: DASHBOARD_SITE,
      });
    }

    if (action === "set_password") {
      // Authenticated (fresh OTP session or normal session). Used during
      // first-time onboarding and as the last step of a password reset.
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const policy = passwordPolicyError(body.password);
      if (policy) return json(res, 400, { error: policy });
      await db(`vakilpedia_accounts?id=eq.${who.accountId}`, {
        method: "PATCH",
        body: { password_hash: hashPassword(body.password), password_set_at: new Date().toISOString() },
        prefer: "return=minimal",
      });
      await verification.audit("password_set", { accountId: who.accountId, ip });
      return json(res, 200, { ok: true });
    }

    if (action === "change_password") {
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const rows = await db(`vakilpedia_accounts?id=eq.${who.accountId}&select=password_hash`);
      const current = rows[0] && rows[0].password_hash;
      // If a password already exists, the correct current one must be given.
      // If none exists yet, this doubles as "set" (dashboard "Set a password").
      if (current && !verifyPassword(String(body.current_password || ""), current)) {
        await verification.audit("password_change_failed", { accountId: who.accountId, ip, meta: { reason: "wrong_current" } });
        return json(res, 401, { error: "wrong_current_password" });
      }
      const policy = passwordPolicyError(body.new_password);
      if (policy) return json(res, 400, { error: policy });
      await db(`vakilpedia_accounts?id=eq.${who.accountId}`, {
        method: "PATCH",
        body: { password_hash: hashPassword(body.new_password), password_set_at: new Date().toISOString() },
        prefer: "return=minimal",
      });
      await verification.audit(current ? "password_changed" : "password_set", { accountId: who.accountId, ip });
      return json(res, 200, { ok: true });
    }

    if (action === "refresh") {
      const presented = String(body.refresh_token || "");
      if (!presented.startsWith("vkr_")) return json(res, 400, { error: "invalid_refresh_token" });
      const hash = hashRefreshToken(presented);
      const rows = await db(
        `refresh_tokens?token_hash=eq.${encodeURIComponent(hash)}&select=id,account_id,expires_at,revoked_at`
      );
      const t = rows[0];
      if (!t) return json(res, 401, { error: "invalid_refresh_token" });
      if (t.revoked_at) {
        // Rotation-reuse: treat as theft — revoke every refresh token for the account.
        await db(`refresh_tokens?account_id=eq.${t.account_id}&revoked_at=is.null`, {
          method: "PATCH",
          body: { revoked_at: new Date().toISOString() },
          prefer: "return=minimal",
        });
        await verification.audit("refresh_token_reuse_detected", { accountId: t.account_id, ip });
        return json(res, 401, { error: "refresh_token_revoked" });
      }
      if (new Date(t.expires_at).getTime() < Date.now())
        return json(res, 401, { error: "refresh_token_expired" });

      // Rotate: revoke the presented token, issue a fresh pair.
      await db(`refresh_tokens?id=eq.${t.id}`, {
        method: "PATCH",
        body: { revoked_at: new Date().toISOString() },
        prefer: "return=minimal",
      });
      const profiles = await db(
        `vakilcard_profiles?account_id=eq.${t.account_id}&select=id`
      );
      const { access, refresh } = await issueTokens(t.account_id, profiles[0] && profiles[0].id, req);
      // Link the chain for audit/forensics.
      await db(`refresh_tokens?token_hash=eq.${encodeURIComponent(hashRefreshToken(refresh))}`, {
        method: "PATCH",
        body: { rotated_from: t.id },
        prefer: "return=minimal",
      });
      return json(res, 200, {
        ok: true,
        token: access,
        access_token: access,
        refresh_token: refresh,
        expires_in: ACCESS_TTL_SEC,
        account_id: t.account_id,
      });
    }

    if (action === "logout") {
      const presented = String(body.refresh_token || "");
      if (presented.startsWith("vkr_")) {
        await db(
          `refresh_tokens?token_hash=eq.${encodeURIComponent(hashRefreshToken(presented))}&revoked_at=is.null`,
          { method: "PATCH", body: { revoked_at: new Date().toISOString() }, prefer: "return=minimal" }
        );
      }
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "unknown_action" });
  } catch (e) {
    // Surface a stable code to the client, but log the real error server-side
    // (Vercel function logs) so password/auth failures are debuggable.
    console.error("[vakilcard/auth]", action, e && (e.stack || e.message || e), e && e.detail ? JSON.stringify(e.detail) : "");
    return json(res, 500, { error: "server_error" });
  }
};
