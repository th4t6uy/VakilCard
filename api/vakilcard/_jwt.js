// Minimal dependency-free HS256 JWT for VakilCard sessions.
// Secret: VAKILPEDIA_AUTH_SECRET (also used to HMAC verification codes).
const crypto = require("crypto");

const SECRET = process.env.VAKILPEDIA_AUTH_SECRET || "";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

// Expiry strategy (documented for CaseLinx compatibility):
//  * Access tokens: 1 hour, stateless HS256 JWT ({sub: account uuid, pid,
//    typ:"access"}). Verified locally by any Vakilpedia service that shares
//    VAKILPEDIA_AUTH_SECRET — CaseLinx can adopt the same tokens.
//  * Refresh tokens: opaque `vkr_<hex>`, 60 days, stored as SHA-256 hashes in
//    refresh_tokens. Single-use with rotation; reuse of a rotated token is
//    treated as theft and revokes the whole account's refresh tokens.
//  * Logout: revokes the presented refresh token (access token simply ages out).
//  * Phase-2 30-day JWTs (no typ) remain verifiable for backward compatibility.
const ACCESS_TTL_SEC = 60 * 60; // 1 hour
const REFRESH_TTL_SEC = 60 * 60 * 24 * 60; // 60 days

function sign(payload, { expiresInSec = ACCESS_TTL_SEC } = {}) {
  if (!SECRET) throw new Error("VAKILPEDIA_AUTH_SECRET not configured");
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec, iss: "vakilpedia" };
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

function verify(token) {
  if (!SECRET || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = b64url(crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(fromB64url(p).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.iss !== "vakilpedia") return null;
  return payload;
}

/** HMAC a verification code — raw codes are never stored. */
function hashCode(code, phone) {
  if (!SECRET) throw new Error("VAKILPEDIA_AUTH_SECRET not configured");
  return crypto.createHmac("sha256", SECRET).update(`${phone}:${code}`).digest("hex");
}

/** Generate an opaque refresh token. Only its hash is ever stored. */
function newRefreshToken() {
  return "vkr_" + crypto.randomBytes(32).toString("hex");
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

module.exports = {
  sign,
  verify,
  hashCode,
  newRefreshToken,
  hashRefreshToken,
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
};
