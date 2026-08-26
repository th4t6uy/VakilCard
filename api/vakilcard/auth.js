// VakilCard authentication — phone-first identity.
//   POST /api/vakilcard/auth  { action: "start",   phone, device_fingerprint? }
//   POST /api/vakilcard/auth  { action: "verify",  phone, code }
//   POST /api/vakilcard/auth  { action: "resend",  phone }
//   POST /api/vakilcard/auth  { action: "status",  phone }
//   POST /api/vakilcard/auth  { action: "refresh", refresh_token }
//   POST /api/vakilcard/auth  { action: "logout",  refresh_token }
//   POST /api/vakilcard/auth  { action: "bridge_from_suite" }         (no body — reads the shared session cookie)
//   POST /api/vakilcard/auth  { action: "redeem_courtque_beta" }       (Bearer auth required)
//
// Successful verification creates the account + a DRAFT VakilCard: the
// username (phone number) and URL are reserved immediately, but nothing is
// public or indexable until the lawyer completes and publishes the card.
// Tokens: 1h access JWT + rotating 60d refresh token (see _jwt.js).
const {
  db,
  readJsonBody,
  resolveAccount,
  readSupabaseAccessTokenFromCookies,
  resolveSupabaseUser,
} = require("./_lib");
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

// CaseLinx's SupraCore signup endpoint — see createAccountViaCaseLinx() below.
// Point this at beta while the bridge is being verified; move it to the
// production CaseLinx origin only after an end-to-end kiosk test passes.
const CASELINX_ORIGIN = process.env.CASELINX_ORIGIN || "https://beta.caselinx.vakilpedia.com";
// The Vakilpedia Account -- the ecosystem's one front door. VakilCard sends people
// here to sign up rather than creating identities of its own (2026-08-26).
const ACCOUNT_ORIGIN = process.env.ACCOUNT_ORIGIN || "https://account.vakilpedia.com";

// CourtQue MPHC-kiosk beta coupon (2026-08-15) — see supracore.coupons row
// 'MPHCBETA' (product_id: courtque, grant_plan: TRIAL, max_redemptions: 33).
// Kept as an action on this file rather than a new endpoint: VakilCard is
// already near Vercel Hobby's 12-serverless-function ceiling (see
// booking.js's Google Calendar comment for the same constraint).
const COURTQUE_BETA_COUPON_CODE = process.env.COURTQUE_BETA_COUPON_CODE || "MPHCBETA";

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

/**
 * Bridge a just-submitted phone+code to CaseLinx's /api/supracore/signup/complete, which is the
 * ONE code path in the whole platform allowed to create a real auth.users + supracore.accounts
 * row (see accountCreator.ts "THE CUTOVER"). VakilCard and CaseLinx share the SAME
 * verification_sessions table by design (otpService.ts: "a code issued by VakilCard must verify
 * here and vice versa") — so this call is what actually consumes the code the user typed, NOT
 * VakilCard's own verification.verify().
 *
 * Returns:
 *   { consumed: true,  accountId: <uuid> }  — real SupraCore account created/adopted. Use this id
 *                                              as the shared id for VakilCard's own account row.
 *   { consumed: true,  accountId: null }    — the code WAS verified and consumed by CaseLinx (so
 *                                              calling verification.verify() again would fail on
 *                                              a spent code), but no shared account was created
 *                                              (e.g. the public-phone-onboarding flag is off on
 *                                              CaseLinx). Caller must treat the phone as proven
 *                                              and fall through to the local-only account path
 *                                              WITHOUT re-verifying.
 *   { consumed: false, accountId: null }    — CaseLinx was unreachable, timed out, or itself
 *                                              rejected the code as invalid/expired — the code is
 *                                              untouched either way, safe to verify locally as
 *                                              before. This function NEVER throws; every failure
 *                                              mode degrades to the pre-bridge behaviour so a
 *                                              CaseLinx outage can never stall the kiosk queue.
 */
async function createAccountViaCaseLinx(phoneE164, code, ip) {
  const controller = new AbortController();
  // 25s, raised from 6s on 2026-08-16. SIX SECONDS WAS NOT ENOUGH and it broke
  // signup outright the moment the bridge started working: CaseLinx's
  // signup/complete does an OTP verify + auth.users create + supracore account +
  // profile write, which routinely exceeds 6s on Render's starter plan. The abort
  // landed in the catch below, this returned consumed:false, and VakilCard then
  // tried to verify a code CaseLinx had ALREADY consumed server-side — so the
  // lawyer saw "Incorrect or expired code" while a real Vakilpedia account had in
  // fact just been created for them. Observed live on +919168125271.
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch(`${CASELINX_ORIGIN}/api/supracore/signup/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip || "" },
      body: JSON.stringify({ phone: phoneE164, code }),
      signal: controller.signal,
    });
    const data = await r.json().catch(() => null);
    if (!data || typeof data !== "object") return await didCaseLinxAlreadyConsume(phoneE164);
    if (data.status === "completed" || data.status === "signed_in") {
      return { consumed: true, accountId: data.accountId || null };
    }
    if (data.status === "account_creation_required") {
      // Verified and consumed on CaseLinx's side; no account was made (flag/allowlist gate).
      return { consumed: true, accountId: null };
    }
    // The ONLY statuses CaseLinx can return BEFORE it matches the code against
    // verification_sessions — i.e. the only ones that PROVE the session is still
    // untouched (see otpService.ts verifyOtp: the row is marked "consumed" the
    // instant the hash matches, before resolveFactor ever runs). Everything else —
    // needs_review / link_available / identity_conflict / misconfigured / unavailable /
    // any future status this endpoint starts returning — happens AFTER that point,
    // so the code may already be spent server-side even though it wasn't accepted
    // here. 2026-08-17: this allowlist replaces a blocklist that only recognized
    // "completed"/"signed_in"/"account_creation_required" as consumed and silently
    // showed "Incorrect or expired code" for needs_review/identity_conflict — exactly
    // the kind of resolver outcome a bar-election crowd of existing accountholders
    // would trigger. Do not add statuses back to this list without first confirming
    // (by reading otpService.ts) that they can only occur pre-match.
    const PROVABLY_NOT_CONSUMED = new Set([
      "invalid_code", "wrong_code", "no_session", "expired", "locked",
      "invalid_phone", "invalid_email", "invalid_input",
    ]);
    if (PROVABLY_NOT_CONSUMED.has(data.status)) {
      return { consumed: false, accountId: null };
    }
    // Unrecognized / post-match status — ask the database what actually happened,
    // exactly like the timeout/network-error path already does.
    return await didCaseLinxAlreadyConsume(phoneE164);
  } catch {
    // TIMEOUT OR NETWORK ERROR — we genuinely do not know whether CaseLinx finished.
    // Never assume it did not: assuming wrongly is what showed a real signup an
    // "expired code" error. Ask the database what actually happened.
    return await didCaseLinxAlreadyConsume(phoneE164);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Did CaseLinx consume this phone's verification session after all?
 *
 * Called only when the bridge call gave no usable answer (timeout, network error,
 * unparseable body). The verification_sessions table is SHARED between VakilCard
 * and CaseLinx, so a `consumed` row is proof CaseLinx verified the code even
 * though we never saw the reply — in which case re-verifying locally is
 * guaranteed to fail on a spent code and would wrongly reject a real signup.
 *
 * Also resolves the SupraCore account id so both sides still share one id, which
 * is the whole point of the bridge. Best-effort throughout: any failure here
 * returns consumed:false, which is the old (safe, pre-2026-08-16) behaviour.
 */
async function didCaseLinxAlreadyConsume(phoneE164) {
  try {
    const rows = await db(
      `verification_sessions?phone_e164=eq.${encodeURIComponent(phoneE164)}` +
      `&order=created_at.desc&limit=1&select=status`
    );
    const consumed = Array.isArray(rows) && rows[0] && rows[0].status === "consumed";
    if (!consumed) return { consumed: false, accountId: null };

    // The code WAS spent by CaseLinx. Recover the shared account id if we can.
    let accountId = null;
    try {
      const resolved = await db("rpc/supracore_admin_resolve_handle", {
        method: "POST",
        body: { p_handle: phoneE164 },
      });
      const match = resolved && Array.isArray(resolved.matches) ? resolved.matches[0] : null;
      accountId = (match && match.accountId) || null;
    } catch {
      /* id recovery is a bonus, not a requirement */
    }
    return { consumed: true, accountId };
  } catch {
    return { consumed: false, accountId: null };
  }
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

/**
 * Records explicit Terms-of-Use acceptance (2026-08-15) — the NFC signup
 * flow previously only implied consent via a sentence of body copy, never
 * a recorded event. `column` is one of the two eula_*_accepted_at columns
 * on vakilpedia_accounts. Only sets it the FIRST time (the `is.null` filter)
 * so the timestamp always reflects original consent, not the most recent
 * login. Best-effort, like touchLogin — a logging failure must never block
 * signup or a beta redemption.
 */
async function stampEulaAcceptance(accountId, column) {
  if (!accountId) return;
  try {
    await db(`vakilpedia_accounts?id=eq.${accountId}&${column}=is.null`, {
      method: "PATCH",
      body: { [column]: new Date().toISOString() },
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

/**
 * Find or create the account + DRAFT profile for a verified phone. Idempotent.
 *
 * `sharedAccountId`, when provided, is a real SupraCore `supracore.accounts.id` /
 * `auth.users.id` obtained from createAccountViaCaseLinx() — VakilCard's own
 * `vakilpedia_accounts.id` is set to the SAME uuid, so the two tables describe one person under
 * one id without any FK/schema change. Omitted (undefined) reproduces the exact pre-bridge
 * behaviour: a fresh, VakilCard-only id.
 */
async function ensureAccountForPhone(phoneE164, ip, sharedAccountId) {
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

  let account;
  if (sharedAccountId) {
    // Adopt-if-present, same idiom as accountCreator.ts step 3: a retry (or a card tapped twice
    // before the profile finished) converges on the one row instead of erroring on the PK.
    const already = await db(`vakilpedia_accounts?id=eq.${sharedAccountId}&select=id`);
    if (already.length) {
      account = already[0];
    } else {
      [account] = await db("vakilpedia_accounts", {
        method: "POST",
        body: { id: sharedAccountId, registration_source: "vakilcard_nfc_bridged" },
        prefer: "return=representation",
      });
    }
  } else {
    // 2026-08-26 -- NO LOCAL-ONLY ACCOUNTS. A signup that cannot obtain a shared
    // Vakilpedia account now FAILS instead of minting a VakilCard-only id.
    //
    // This fallback is what produced every split identity on the platform: 14 rows
    // in vakilpedia_accounts (registration_source 'vakilcard' / 'vakilcard_google')
    // with no supracore.accounts row and no auth.users row, 3 of them a SECOND
    // identity for a phone that already had a real Vakilpedia account. By contrast
    // all 15 'vakilcard_nfc_bridged' rows share their uuid correctly -- the bridge
    // works whenever it is used, so this branch was the only leak.
    //
    // Both reasons it used to fire are closed: the account-creation gate admits any
    // OTP-verified phone since 2026-08-15 (NEXT_PUBLIC_ENABLE_PUBLIC_PHONE_ONBOARDING,
    // verified true in Render 2026-08-26) and the bridge timeout went 6s -> 25s on
    // 2026-08-16. So reaching here now means the shared endpoint is genuinely down or
    // refusing -- and the honest answer is "try again in a minute", not a second
    // identity somebody has to merge by hand later.
    return { error: "shared_account_unavailable" };
  }
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

  // 2026-08-26 -- VakilCard no longer creates identities of its own; see the note in
  // ensureAccountForPhone. Unlike the phone path there is no bridge from here to the
  // shared account-creation endpoint, and Google sign-in already exists on the
  // Vakilpedia Account -- so a NEW Google user is sent there instead of being given a
  // VakilCard-only identity (that branch is where registration_source
  // 'vakilcard_google' came from).
  //
  // EXISTING Google users are untouched: the provider_uid lookup above returns before
  // this point is ever reached.
  return { error: "signup_moved_to_account" };
}

/**
 * Create a VakilCard account for someone who is ALREADY a proven Vakilpedia
 * identity -- they are signed in on account.vakilpedia.com right now and the
 * shared session cookie is on this request.
 *
 * Deliberately no OTP. The phone path exists to PROVE who someone is; here
 * that is already settled by a Supabase-confirmed session, and sending
 * another WhatsApp code would charge the company for proof it already holds.
 *
 * The new row takes the SUPABASE USER'S OWN UUID as its primary key, the
 * same idiom ensureAccountForPhone uses for its sharedAccountId. That is the
 * whole point: from the next page load onward this account is found by path
 * 1 of the bridge (direct id match), so the email fallback is never needed
 * again for this person and the two sides can never drift apart.
 *
 * Adopt-if-present throughout, so a double-tap converges on one row instead
 * of erroring on the primary key.
 */
async function ensureAccountForSupabaseIdentity(supaUser, ip) {
  const accountId = supaUser.id;

  const already = await db(`vakilpedia_accounts?id=eq.${accountId}&select=id`);
  if (!already.length) {
    await db("vakilpedia_accounts", {
      method: "POST",
      body: { id: accountId, registration_source: "vakilpedia_account_bridge" },
      prefer: "return=minimal",
    });
  }

  const existingProfiles = await db(
    `vakilcard_profiles?account_id=eq.${accountId}&select=id,username,full_name,is_published`
  );
  if (existingProfiles.length) {
    return { accountId, profile: existingProfiles[0], created: false };
  }

  const meta = supaUser.user_metadata || {};
  const emailLocal = String(supaUser.email || "").split("@")[0] || "";
  const fullName =
    String(meta.full_name || meta.name || emailLocal || "").slice(0, 120) || "Advocate";

  const uname = await generateAutoUsername(fullName, null, async (candidate) => {
    const clash = await db(
      `vakilcard_profiles?username=eq.${encodeURIComponent(candidate)}&select=id`
    );
    if (clash.length) return true;
    const aliasClash = await db(
      `vakilcard_aliases?alias=eq.${encodeURIComponent(candidate)}&select=profile_id`
    );
    return aliasClash.length > 0;
  });

  // DRAFT card: the URL and username are reserved now, nothing is public or
  // indexable until the owner completes and publishes it.
  const [profile] = await db("vakilcard_profiles", {
    method: "POST",
    body: {
      account_id: accountId,
      username: uname,
      created_username: uname,
      full_name: fullName,
      email: supaUser.email || null,
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
    accountId,
    ip,
    meta: {
      profile_id: profile.id,
      username: uname,
      draft: true,
      source: "vakilpedia_account_bridge",
    },
  });
  // No WhatsApp welcome -- no phone is attached yet. The dashboard's existing
  // add-phone nudge covers that, and it unlocks booking alerts when they do.

  return { accountId, profile, created: true };
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
      // Try the shared verification_sessions row against CaseLinx FIRST — see
      // createAccountViaCaseLinx() for exactly why the ordering matters (it may consume the
      // code). Any failure of the bridge itself (not the code) degrades to the untouched,
      // VakilCard-only flow below.
      const normalizedPhone = verification.normalizePhone(body.phone);
      const bridged = normalizedPhone
        ? await createAccountViaCaseLinx(normalizedPhone, body.code, ip)
        : { consumed: false, accountId: null };

      let r;
      if (bridged.consumed) {
        // CaseLinx already proved and consumed this code — verifying again here would fail on
        // a spent code, so trust CaseLinx's proof instead of re-checking locally.
        r = { ok: true, phoneE164: normalizedPhone };
      } else {
        r = await verification.verify({ phone: body.phone, code: body.code, ip });
        if (!r.ok) return json(res, r.error === "locked" ? 429 : 400, r);
      }

      const ensured = await ensureAccountForPhone(r.phoneE164, ip, bridged.accountId);
      if (ensured.error) {
        // The code is spent by this point (either here or on the shared endpoint), so the
        // caller genuinely needs a fresh one. Say that plainly rather than 500ing.
        return json(res, 503, {
          ok: false,
          error: ensured.error,
          message:
            "We could not finish setting up your Vakilpedia account just now. Please request a new code and try again in a minute.",
        });
      }
      const { accountId, profile, created } = ensured;
      const { access, refresh } = await issueTokens(accountId, profile && profile.id, req);
      await touchLogin(accountId);
      if (body.eula_accepted === true) {
        await stampEulaAcceptance(accountId, "eula_vakilcard_accepted_at");
      }
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

      const ensuredG = await ensureAccountForGoogle({ sub, email, name }, ip);
      if (ensuredG.error) {
        return json(res, 409, {
          ok: false,
          error: ensuredG.error,
          message: "Create your Vakilpedia account first \u2014 one account opens every app.",
          sign_up_url: `${ACCOUNT_ORIGIN}/sign-up`,
        });
      }
      const { accountId, profile, created } = ensuredG;
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

    // ── Silent cross-app SSO (2026-08-15, P0) ──────────────────────────
    // If the browser already carries a valid Suite/CaseLinx session cookie
    // (Domain=.vakilpedia.com — see Apps/Suite/src/lib/supabase/middleware.ts),
    // it is automatically present on this request too; log the same person
    // into VakilCard without a second sign-in. Called unprompted by App.js on
    // every signed-out page load, so every failure mode below degrades to
    // "no session found" (200, found:false), never an error — a missing/
    // expired/foreign cookie must never disrupt VakilCard's own sign-in flow.
    if (action === "bridge_from_suite") {
      const accessToken = readSupabaseAccessTokenFromCookies(req);
      if (!accessToken) return json(res, 200, { ok: true, found: false });

      const supaUser = await resolveSupabaseUser(accessToken);
      if (!supaUser || !supaUser.id) return json(res, 200, { ok: true, found: false });

      // 1. The clean case: this Supabase identity IS a VakilCard account,
      //    because it was created/adopted through the NFC account bridge —
      //    same uuid on both sides (see ensureAccountForPhone's sharedAccountId).
      let accountId = null;
      const direct = await db(`vakilpedia_accounts?id=eq.${supaUser.id}&select=id`);
      if (direct.length) {
        accountId = direct[0].id;
      } else if (supaUser.phone) {
        // 2. Fallback for accounts that pre-date the bridge: same phone,
        //    different id on each side. account_phone_identities is shared
        //    between VakilCard and CaseLinx by design (both write to it) —
        //    resolve the phone SupraCore has for this identity, then see if
        //    that phone already has its own (older, unlinked) VakilCard
        //    account. A phone match is proof-of-ownership grade, same as any
        //    OTP re-login, so it's safe to sign in on it directly.
        const rawPhone = String(supaUser.phone);
        const phoneE164 = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;
        const viaPhone = await db(
          `account_phone_identities?phone_e164=eq.${encodeURIComponent(phoneE164)}&select=account_id`
        );
        if (viaPhone.length) accountId = viaPhone[0].account_id;
      }

      // 3. Email. Proven necessary 2026-08-26: the Account signs people in
      //    by EMAIL and most of those identities carry no phone at all
      //    (auth.users.phone is null for 20 of 36 accounts), so paths 1 and
      //    2 both miss and a lawyer who already owns a VakilCard was shown
      //    the signup screen instead of their own dashboard.
      //
      //    Only a Supabase-CONFIRMED email is accepted, and only when it
      //    resolves to exactly ONE account. A confirmed email is the same
      //    grade of proof as the phone match above; an unconfirmed one is
      //    not proof of anything, and an ambiguous one is not proof of
      //    WHICH person -- both fall through to found:false rather than
      //    guessing, because guessing here signs someone into a stranger's
      //    card.
      if (!accountId && supaUser.email && supaUser.email_confirmed_at) {
        const viaEmail = await db(
          `account_oauth_identities?email=eq.${encodeURIComponent(supaUser.email)}&select=account_id`
        );
        const ids = Array.from(new Set(viaEmail.map((r) => r.account_id)));
        if (ids.length === 1) accountId = ids[0];
      }

      if (!accountId) {
        // No VakilCard account -- but we know exactly who this is, and they
        // are already signed in to Vakilpedia. Hand the SPA enough to offer
        // one tap ("Create your VakilCard") instead of a signup screen that
        // asks for an OTP the platform has already paid for once. Nothing
        // is written until that tap: see action "create_from_suite".
        const canCreate = Boolean(supaUser.email && supaUser.email_confirmed_at);
        return json(res, 200, {
          ok: true,
          found: false,
          invite: canCreate
            ? {
                email: supaUser.email,
                name:
                  (supaUser.user_metadata &&
                    (supaUser.user_metadata.full_name || supaUser.user_metadata.name)) ||
                  null,
              }
            : null,
        });
      }

      const profiles = await db(`vakilcard_profiles?account_id=eq.${accountId}&select=id,username,is_published`);
      const profile = profiles[0] || null;
      const { access, refresh } = await issueTokens(accountId, profile && profile.id, req);
      await touchLogin(accountId);
      verification
        .audit("bridge_login_from_suite", { accountId, ip, meta: { supabaseUserId: supaUser.id } })
        .catch(() => {}); // best-effort — never fail a silent login over an audit-log write

      return json(res, 200, {
        ok: true,
        found: true,
        token: access,
        access_token: access,
        refresh_token: refresh,
        expires_in: ACCESS_TTL_SEC,
        account_id: accountId,
        username: profile ? profile.username : null,
        published: profile ? profile.is_published === true : false,
      });
    }

    // ── One-tap VakilCard for a proven Vakilpedia identity ─────────────
    // The other half of bridge_from_suite's `invite`. Called only from the
    // button that invite renders, and it re-derives EVERYTHING from the
    // cookie on this request -- the client sends no identity of its own, so
    // there is nothing here to forge. Idempotent: if an account appeared
    // between the invite and the tap (another tab, a double-click), this
    // signs into that one instead of creating a second.
    if (action === "create_from_suite") {
      const accessToken = readSupabaseAccessTokenFromCookies(req);
      if (!accessToken) return json(res, 401, { ok: false, error: "no_vakilpedia_session" });

      const supaUser = await resolveSupabaseUser(accessToken);
      if (!supaUser || !supaUser.id) {
        return json(res, 401, { ok: false, error: "no_vakilpedia_session" });
      }
      if (!supaUser.email || !supaUser.email_confirmed_at) {
        return json(res, 403, { ok: false, error: "email_not_confirmed" });
      }

      // An older, unlinked account for this same person must win over a new
      // one -- creating a second would strand their existing card.
      let existingId = null;
      const direct = await db(`vakilpedia_accounts?id=eq.${supaUser.id}&select=id`);
      if (direct.length) existingId = direct[0].id;
      if (!existingId) {
        const viaEmail = await db(
          `account_oauth_identities?email=eq.${encodeURIComponent(supaUser.email)}&select=account_id`
        );
        const ids = Array.from(new Set(viaEmail.map((r) => r.account_id)));
        if (ids.length === 1) existingId = ids[0];
      }

      let accountId;
      let profile;
      if (existingId) {
        accountId = existingId;
        const profiles = await db(
          `vakilcard_profiles?account_id=eq.${accountId}&select=id,username,is_published`
        );
        profile = profiles[0] || null;
      } else {
        const made = await ensureAccountForSupabaseIdentity(supaUser, ip);
        accountId = made.accountId;
        profile = made.profile || null;
      }

      const { access, refresh } = await issueTokens(accountId, profile && profile.id, req);
      await touchLogin(accountId);
      verification
        .audit("created_from_vakilpedia_account", {
          accountId,
          ip,
          meta: { supabaseUserId: supaUser.id, adopted: Boolean(existingId) },
        })
        .catch(() => {});

      return json(res, 200, {
        ok: true,
        found: true,
        token: access,
        access_token: access,
        refresh_token: refresh,
        expires_in: ACCESS_TTL_SEC,
        account_id: accountId,
        username: profile ? profile.username : null,
        published: profile ? profile.is_published === true : false,
      });
    }

    // ── CourtQue MPHC-kiosk beta coupon redemption ─────────────────────
    // One tap from a signed-in VakilCard session — see COURTQUE_BETA_COUPON_CODE
    // above and supracore_coupon_redeem (the RPC already existed; this is
    // its first caller). Fails as a normal {ok:false, error} response, not
    // an exception, for every expected case (already exhausted, expired,
    // already redeemed) — only genuine infra failure returns non-200.
    if (action === "redeem_courtque_beta") {
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });

      let result;
      try {
        const rpcResult = await db("rpc/supracore_coupon_redeem", {
          method: "POST",
          body: { p_account_id: who.accountId, p_code: COURTQUE_BETA_COUPON_CODE, p_actor_id: who.accountId },
        });
        result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
      } catch (e) {
        console.error("[vakilcard/auth] redeem_courtque_beta RPC failed:", e && (e.message || e));
        return json(res, 502, { ok: false, error: "redeem_unavailable" });
      }

      if (!result || result.ok !== true) {
        return json(res, 200, { ok: false, error: (result && result.error) || "unknown_error" });
      }
      if (body.eula_accepted === true) {
        await stampEulaAcceptance(who.accountId, "eula_courtque_accepted_at");
      }
      return json(res, 200, {
        ok: true,
        idempotent: !!result.idempotent,
        plan: result.plan,
        limits: result.limits,
        expiresAt: result.expiresAt,
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
