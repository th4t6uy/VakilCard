// Account management: usernames, aliases.
//   GET  /api/vakilcard/account                    → identities + aliases overview
//   POST /api/vakilcard/account { action: "change_username", username }
// Auth: VakilCard JWT (Bearer).
//
// Username changes never break links: the old username is demoted to a
// permanent-redirect alias and recorded in vakilcard_username_history.
const {
  db,
  readJsonBody,
  resolveAccount,
  validateUsername,
  isReservedUsername,
} = require("./_lib");
const { audit } = require("./_verify");
const { requirePro, primePaidPlans } = require("./_entitlements");
const { generateAutoUsername } = require("./_usernames");
const { usernameTakenBy, switchUsername, holdUsername, applyPendingUsername } = require("./_usernameSwitch");
const { isProActive } = require("./_entitlements");

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

async function ownProfile(accountId) {
  const rows = await db(
    `vakilcard_profiles?account_id=eq.${accountId}&select=id,username,full_name,phone,username_source,created_username,subscription_plan,subscription_status,subscription_expires_at,founder_pricing,pending_username,pending_username_until`
  );
  return rows[0] || null;
}

module.exports = async function handler(req, res) {
  await primePaidPlans(); // admin "Paid plans" switch -- see _entitlements.js
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
    async function performUsernameSwitch(profile, uname, opts) {
      return json(res, 200, await switchUsername(accountId, profile, uname, opts));
    }

    // HOLD a custom link while a Free lawyer pays for Pro (founder, 5 Oct 2026:
    // "if user wants pro username accept payment there itself"). The client
    // then opens the normal Pro checkout; payment success applies the link.
    if (action === "hold_username") {
      const profile = await ownProfile(accountId);
      if (!profile) return json(res, 404, { error: "no_profile" });
      const out = await holdUsername(profile, body.username);
      if (!out.ok) return json(res, out.error === "username_held" || out.error === "username_taken" ? 409 : 400, { error: out.error });
      return json(res, 200, out);
    }

    // Pro already (e.g. paid, tab closed before the app applied the link):
    // apply the held link now. Harmless no-op otherwise.
    if (action === "apply_pending_username") {
      const profile = await ownProfile(accountId);
      if (!profile) return json(res, 404, { error: "no_profile" });
      if (!isProActive(profile)) return json(res, 402, { error: "pro_required" });
      const uname = await applyPendingUsername(accountId, profile);
      return json(res, 200, { ok: true, username: uname || profile.username, applied: !!uname });
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

      const taken = await usernameTakenBy(uname, profile.id);
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
      const taken = await usernameTakenBy(uname, profile.id);
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
      const taken = await usernameTakenBy(digits, profile.id);
      if (taken && !(taken.reason === "taken" && taken.profileId === profile.id))
        return json(res, 409, { error: "username_" + taken.reason });
      return performUsernameSwitch(profile, digits, { aliasKind: "phone", source: "PHONE" });
    }

    return json(res, 400, { error: "unknown_action" });
  } catch (e) {
    return json(res, 500, { error: "server_error" });
  }
};
