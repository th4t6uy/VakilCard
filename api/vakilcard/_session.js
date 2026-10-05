// VakilCard sign-in -> the ONE shared Vakilpedia session (Supabase is the session authority).
//
// Founder, 5 Oct 2026: "everything is through SupraCore, same identity all across". VakilCard used to hand
// out its own HS256 tokens (_jwt.js) next to the platform's. This module makes VakilCard hand out the
// SAME kind of session every other app uses, with the same two calls CaseLinx's sessionMinting.ts uses:
//   1. admin generate_link (magiclink) for the account's address on auth.users -> hashed_token
//      (server side only, no email is ever sent), then
//   2. verify with that token_hash -> a genuine Supabase session (access_token + refresh_token).
// Refresh and sign-out also go to Supabase. Nothing here signs a token itself.
//
// SAFETY: every failure returns { ok:false, reason } and the caller falls back to the old VakilCard token,
// so a Supabase hiccup, a missing key or an account without an address can never lock anybody out.
// Switch: VAKILCARD_SHARED_SESSION=off turns minting off (everybody gets old-style tokens again).
// A token is never logged.
const crypto = require("crypto");

const cfg = () => ({
  url: String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, ""),
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
  service: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
});

const TIMEOUT_MS = 4000;

async function http(fetchImpl, url, { method = "GET", headers = {}, body } = {}) {
  const f = fetchImpl || fetch;
  const r = await f(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
  });
  let data = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  return { ok: r.ok, status: r.status, data };
}

/** Mint a real Supabase session for an existing account. Never throws. */
async function mintSession(accountId, { fetchImpl } = {}) {
  try {
    if (String(process.env.VAKILCARD_SHARED_SESSION || "").toLowerCase() === "off") return { ok: false, reason: "switched_off" };
    const { url, anon, service } = cfg();
    if (!url || !service) return { ok: false, reason: "missing_supabase_config" };
    if (!anon) return { ok: false, reason: "missing_anon_key" };
    if (!/^[0-9a-f-]{36}$/i.test(String(accountId || ""))) return { ok: false, reason: "bad_account_id" };

    const admin = { apikey: service, Authorization: `Bearer ${service}` };
    const u = await http(fetchImpl, `${url}/auth/v1/admin/users/${accountId}`, { headers: admin });
    if (u.status === 404) return { ok: false, reason: "no_auth_user" };
    if (!u.ok || !u.data) return { ok: false, reason: `user_lookup_${u.status}` };
    const user = u.data.user || u.data;
    if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) return { ok: false, reason: "banned" };
    if (!user.email) return { ok: false, reason: "no_email_on_auth_user" };

    const g = await http(fetchImpl, `${url}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: admin,
      body: { type: "magiclink", email: user.email },
    });
    const tokenHash = g.data && (g.data.hashed_token || (g.data.properties && g.data.properties.hashed_token));
    if (!g.ok || !tokenHash) return { ok: false, reason: `generate_link_${g.status}` };

    const v = await http(fetchImpl, `${url}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: anon },
      body: { type: "magiclink", token_hash: tokenHash },
    });
    const d = v.data || {};
    if (!v.ok || !d.access_token || !d.refresh_token) return { ok: false, reason: `verify_${v.status}` };
    return {
      ok: true,
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_in: d.expires_in || 3600,
      user_id: (d.user && d.user.id) || user.id || accountId,
    };
  } catch (e) {
    return { ok: false, reason: `exception_${(e && e.name) || "error"}` };
  }
}

/** Exchange a Supabase refresh token for a new pair (Supabase rotates it). Never throws. */
async function refreshSession(refreshToken, { fetchImpl } = {}) {
  try {
    const { url, anon } = cfg();
    if (!url || !anon) return { ok: false, status: 503, reason: "missing_supabase_config" };
    if (!refreshToken || typeof refreshToken !== "string" || refreshToken.length > 600) return { ok: false, status: 400, reason: "bad_token" };
    const r = await http(fetchImpl, `${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: anon },
      body: { refresh_token: refreshToken },
    });
    const d = r.data || {};
    if (!r.ok || !d.access_token || !d.refresh_token) return { ok: false, status: r.status || 502, reason: `refresh_${r.status}` };
    return {
      ok: true,
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_in: d.expires_in || 3600,
      user_id: d.user && d.user.id,
    };
  } catch (e) {
    return { ok: false, status: 502, reason: `exception_${(e && e.name) || "error"}` };
  }
}

/** End just this device's session. Best effort, never throws. */
async function revokeSession(accessToken, { fetchImpl } = {}) {
  try {
    const { url, anon } = cfg();
    if (!url || !anon || !accessToken) return false;
    const r = await http(fetchImpl, `${url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${accessToken}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

/* ---- who is holding this access token? (30 s cache, so a page of API calls is one lookup) ---- */
const CACHE_MS = 30_000;
const CACHE_MAX = 500;
const cache = new Map();

async function verifyAccessToken(token, { fetchImpl } = {}) {
  try {
    const { url, anon, service } = cfg();
    if (!url || !token || typeof token !== "string" || token.length > 4000) return null;
    const key = crypto.createHash("sha256").update(token).digest("hex");
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.user;
    const r = await http(fetchImpl, `${url}/auth/v1/user`, {
      headers: { apikey: anon || service, Authorization: `Bearer ${token}` },
    });
    const user = r.ok && r.data && r.data.id ? { id: r.data.id, email: r.data.email || null } : null;
    if (user) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(key, { user, until: Date.now() + CACHE_MS });
    }
    return user;
  } catch {
    return null;
  }
}

function _clearCacheForTests() {
  cache.clear();
}

module.exports = { mintSession, refreshSession, revokeSession, verifyAccessToken, _clearCacheForTests };
