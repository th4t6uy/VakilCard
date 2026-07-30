// Account management: usernames, aliases, identity linking.
//   GET  /api/vakilcard/account                    → identities + aliases overview
//   POST /api/vakilcard/account { action: "change_username", username }
//   POST /api/vakilcard/account { action: "link_google", id_token }
//   POST /api/vakilcard/account { action: "unlink_google" }
// Auth: VakilCard JWT or Firebase ID token (Bearer).
//
// Username changes never break links: the old username is demoted to a
// permanent-redirect alias and recorded in vakilcard_username_history.
const {
  db,
  readJsonBody,
  resolveAccount,
  verifyFirebaseToken,
  validateUsername,
  isReservedUsername,
} = require("./_lib");
const { audit } = require("./_verify");
const { requirePro } = require("./_entitlements");
const { generateAutoUsername } = require("./_usernames");

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

async function ownProfile(accountId) {
  const rows = await db(
    `vakilcard_profiles?account_id=eq.${accountId}&select=id,username,full_name,phone,username_source,created_username,subscription_plan,subscription_status,subscription_expires_at,founder_pricing`
  );
  return rows[0] || null;
}

async function usernameTakenBy(uname) {
  if (await isReservedUsername(uname)) return { reason: "reserved" };
  const prof = await db(`vakilcard_profiles?username=eq.${encodeURIComponent(uname)}&select=id`);
  if (prof.length) return { reason: "taken", profileId: prof[0].id };
  const alias = await db(`vakilcard_aliases?alias=eq.${encodeURIComponent(uname)}&select=profile_id`);
  if (alias.length) return { reason: "taken", profileId: alias[0].profile_id };
  return null;
}

module.exports = async function handler(req, res) {
  const who = await resolveAccount(req);
  if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
  const accountId = who.accountId;

  try {
    if (req.method === "GET") {
      const [phones, oauth, profile, acct] = await Promise.all([
        db(`account_phone_identities?account_id=eq.${accountId}&select=phone_e164,verified_at,is_primary`),
        db(`account_oauth_identities?account_id=eq.${accountId}&select=provider,email,display_name,linked_at`),
        ownProfile(accountId),
        db(`vakilpedia_accounts?id=eq.${accountId}&select=password_hash`),
      ]);
      const aliases = profile
        ? await db(`vakilcard_aliases?profile_id=eq.${profile.id}&select=alias,kind,is_primary,created_at`)
        : [];
      // Boolean only — the hash never leaves the server. Drives the dashboard's
      // "Set a password" vs "Change password" branch (VakilCardPage.js).
      const has_password = !!(acct && acct[0] && acct[0].password_hash);
      return json(res, 200, { account_id: accountId, phones, oauth, profile, aliases, has_password });
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const body = await readJsonBody(req);
    const action = String(body.action || "");

    // Alias-preserving username switch, shared by all three sources.
    // Order matters for crash-safety: history first, then the new alias,
    // then the profile switch, then flag flips — every step is idempotent
    // or harmless to re-run.
    async function performUsernameSwitch(profile, uname, { aliasKind, source, extra = {} }) {
      await db("vakilcard_username_history", {
        method: "POST",
        body: { profile_id: profile.id, old_username: profile.username, new_username: uname },
        prefer: "return=minimal",
      });
      await db("vakilcard_aliases?on_conflict=alias", {
        method: "POST",
        body: { alias: uname, profile_id: profile.id, kind: aliasKind, is_primary: true },
        prefer: "resolution=merge-duplicates,return=minimal",
      });
      await db(`vakilcard_profiles?id=eq.${profile.id}`, {
        method: "PATCH",
        body: { username: uname, username_source: source, ...extra },
        prefer: "return=minimal",
      });
      // Old username stays as a permanent redirect.
      await db(`vakilcard_aliases?alias=eq.${encodeURIComponent(profile.username)}`, {
        method: "PATCH",
        body: { is_primary: false },
        prefer: "return=minimal",
      });
      await audit("username_changed", {
        accountId,
        meta: { from: profile.username, to: uname, profile_id: profile.id, source },
      });
      return json(res, 200, {
        ok: true,
        username: uname,
        username_source: source,
        card_url: `https://www.vakilpedia.com/${uname}`,
        previous_redirects: true,
      });
    }

    // CUSTOM username — Pro only. Reserved for as long as Pro stays active;
    // on lapse it keeps redirecting (links never break) but can't be changed
    // to a new custom name without re-upgrading.
    if (action === "change_username") {
      const profile = await ownProfile(accountId);
      if (!profile) return json(res, 404, { error: "no_profile" });
      if (!requirePro(res, profile, "custom_username")) return;
      const v = validateUsername(body.username);
      if (!v.ok) return json(res, 400, { error: "username_" + v.reason });
      const uname = v.uname;
      if (profile.username === uname) return json(res, 200, { ok: true, username: uname });

      const taken = await usernameTakenBy(uname);
      // Reclaiming one of your own aliases is allowed.
      if (taken && !(taken.reason === "taken" && taken.profileId === profile.id))
        return json(res, 409, { error: "username_" + taken.reason });

      return performUsernameSwitch(profile, uname, { aliasKind: "custom", source: "CUSTOM" });
    }

    // AUTO username — free. Generated once from name + phone; the generated
    // string itself is immutable (created_username): re-selecting AUTO
    // always returns to the same address.
    if (action === "set_username_auto") {
      const profile = await ownProfile(accountId);
      if (!profile) return json(res, 404, { error: "no_profile" });
      let uname = profile.created_username;
      if (!uname) {
        const fullName = String(body.full_name || profile.full_name || "").slice(0, 120);
        uname = await generateAutoUsername(fullName, profile.phone, async (candidate) => {
          const v = validateUsername(candidate, { allowNumeric: true });
          if (!v.ok) return true;
          return !!(await usernameTakenBy(candidate));
        });
      }
      if (profile.username === uname)
        return json(res, 200, { ok: true, username: uname, username_source: "AUTO" });
      const taken = await usernameTakenBy(uname);
      if (taken && !(taken.reason === "taken" && taken.profileId === profile.id))
        return json(res, 409, { error: "username_" + taken.reason });
      return performUsernameSwitch(profile, uname, {
        aliasKind: "custom",
        source: "AUTO",
        extra: profile.created_username ? {} : { created_username: uname },
      });
    }

    // PHONE username — free, but ONLY with explicit consent: the number
    // becomes part of the public URL.
    if (action === "set_username_phone") {
      if (body.consent !== true) return json(res, 400, { error: "consent_required" });
      const profile = await ownProfile(accountId);
      if (!profile) return json(res, 404, { error: "no_profile" });
      const digits = String(profile.phone || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
      if (!digits) return json(res, 400, { error: "no_phone" });
      if (profile.username === digits)
        return json(res, 200, { ok: true, username: digits, username_source: "PHONE" });
      const taken = await usernameTakenBy(digits);
      if (taken && !(taken.reason === "taken" && taken.profileId === profile.id))
        return json(res, 409, { error: "username_" + taken.reason });
      return performUsernameSwitch(profile, digits, { aliasKind: "phone", source: "PHONE" });
    }

    if (action === "link_google") {
      const fb = await verifyFirebaseToken(String(body.id_token || ""));
      if (!fb) return json(res, 400, { error: "invalid_google_token" });
      const existing = await db(
        `account_oauth_identities?provider_uid=eq.${encodeURIComponent(fb.uid)}&provider=in.(firebase,google)&select=account_id`
      );
      if (existing.length && existing[0].account_id !== accountId)
        return json(res, 409, { error: "google_linked_elsewhere" });
      if (!existing.length) {
        await db("account_oauth_identities", {
          method: "POST",
          body: { account_id: accountId, provider: "google", provider_uid: fb.uid, email: fb.email },
          prefer: "return=minimal",
        });
      }
      await audit("google_linked", { accountId, meta: { email: fb.email } });
      return json(res, 200, { ok: true, email: fb.email });
    }

    if (action === "unlink_google") {
      // Never strand the account: phone identity must exist before unlinking.
      const phones = await db(
        `account_phone_identities?account_id=eq.${accountId}&verified_at=not.is.null&select=id`
      );
      if (!phones.length) return json(res, 400, { error: "would_lock_out" });
      await db(
        `account_oauth_identities?account_id=eq.${accountId}&provider=in.(firebase,google)`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      await audit("google_unlinked", { accountId });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "unknown_action" });
  } catch (e) {
    return json(res, 500, { error: "server_error" });
  }
};
