// Username moves, availability and the "pay for this link" hold — one place
// (founder, 5 Oct 2026: picking a link must be easy and prominent, and a
// custom link is paid for right there, in the same sheet).
//
// HOLD. When a Free lawyer picks an available custom link and taps pay, the
// link is held for HOLD_MINUTES so nobody else can take it while the UPI
// app is open. Payment success applies it (subscription.js verify), and so
// does the next /me or /account load once the profile is Pro (covers a
// closed tab after paying). An expired hold simply stops counting.
// Columns: vakilcard_profiles.pending_username / pending_username_until
// (supabase/migrations/20261005120000_vakilcard_username_hold.sql).

const { db, validateUsername, isReservedUsername } = require("./_lib");
const { audit } = require("./_verify");

const HOLD_MINUTES = 30;

function holdLive(p, now = Date.now()) {
  return !!(p && p.pending_username && p.pending_username_until && Date.parse(p.pending_username_until) > now);
}

/** Who (if anyone) stands in the way of `uname`. Own profile never blocks. */
async function usernameTakenBy(uname, ownProfileId = null) {
  if (await isReservedUsername(uname)) return { reason: "reserved" };
  const enc = encodeURIComponent(uname);
  const [prof, alias, held] = await Promise.all([
    db(`vakilcard_profiles?username=eq.${enc}&select=id`),
    db(`vakilcard_aliases?alias=eq.${enc}&select=profile_id`),
    db(`vakilcard_profiles?pending_username=eq.${enc}&select=id,pending_username,pending_username_until`).catch(() => []),
  ]);
  if (prof.length && prof[0].id !== ownProfileId) return { reason: "taken", profileId: prof[0].id };
  if (alias.length && alias[0].profile_id !== ownProfileId) return { reason: "taken", profileId: alias[0].profile_id };
  const h = held.find((r) => r.id !== ownProfileId && holdLive(r));
  if (h) return { reason: "held", profileId: h.id };
  return null;
}

/** Alias-preserving switch. Order matters for crash-safety: history first,
 *  then the new alias, then the profile, then flag flips — every step is
 *  idempotent or harmless to re-run. Returns the API answer body. */
async function switchUsername(accountId, profile, uname, { aliasKind, source, extra = {} }) {
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
    body: { username: uname, username_source: source, pending_username: null, pending_username_until: null, ...extra },
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
  return {
    ok: true,
    username: uname,
    username_source: source,
    card_url: `https://www.vakilpedia.com/${uname}`,
    previous_redirects: true,
  };
}

/** Hold `raw` for this profile while they pay. Returns { ok, username,
 *  until } or { ok:false, error }. */
async function holdUsername(profile, raw) {
  const v = validateUsername(raw);
  if (!v.ok) return { ok: false, error: "username_" + v.reason };
  const uname = v.uname;
  if (uname === profile.username) return { ok: false, error: "username_same" };
  const taken = await usernameTakenBy(uname, profile.id);
  if (taken) return { ok: false, error: "username_" + taken.reason };
  // An EXPIRED hold by someone else still occupies the unique index; free it.
  await db(
    `vakilcard_profiles?pending_username=eq.${encodeURIComponent(uname)}&id=neq.${profile.id}&pending_username_until=lt.${encodeURIComponent(new Date().toISOString())}`,
    { method: "PATCH", body: { pending_username: null, pending_username_until: null }, prefer: "return=minimal" }
  );
  const until = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  try {
    await db(`vakilcard_profiles?id=eq.${profile.id}`, {
      method: "PATCH",
      body: { pending_username: uname, pending_username_until: until },
      prefer: "return=minimal",
    });
  } catch (e) {
    return { ok: false, error: "username_held" }; // lost a race for the same name
  }
  return { ok: true, username: uname, until };
}

/** If the profile is Pro and holds a pending link, make it theirs. Never
 *  throws; returns the new username or null. Pro is checked by the caller
 *  (isProActive) so this stays free of entitlement imports. A pending link
 *  is applied even after the 30-minute hold if it is still free — someone
 *  who paid must get the link they paid for whenever possible. */
async function applyPendingUsername(accountId, profile) {
  try {
    if (!profile || !profile.pending_username) return null;
    const uname = profile.pending_username;
    if (uname === profile.username) return null;
    const taken = await usernameTakenBy(uname, profile.id);
    if (taken) {
      await db(`vakilcard_profiles?id=eq.${profile.id}`, {
        method: "PATCH",
        body: { pending_username: null, pending_username_until: null },
        prefer: "return=minimal",
      });
      return null;
    }
    const out = await switchUsername(accountId, profile, uname, { aliasKind: "custom", source: "CUSTOM" });
    return out.username;
  } catch (e) {
    console.error("[vakilcard/username] apply pending failed:", e && e.message);
    return null;
  }
}

module.exports = { HOLD_MINUTES, holdLive, usernameTakenBy, switchUsername, holdUsername, applyPendingUsername };
