// Password hashing for Vakilpedia accounts — scrypt (Node stdlib, no deps).
// Format: scrypt$N$r$p$<salt b64>$<hash b64>. Never store or log plaintext.
//
// This is the SINGLE shared password implementation for VakilCard: both
// `set_password` and `change_password` (auth.js) go through hashPassword /
// verifyPassword here — no hashing logic is duplicated anywhere else in the
// live (frontend/) tree.
const crypto = require("crypto");

const N = 16384,
  R = 8,
  P = 1,
  KEYLEN = 64;

/** Hash a plaintext password into the self-describing scrypt string above. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Constant-time verify against a stored scrypt string. Never throws. */
function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = String(stored || "").split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(String(password), salt, expected.length, {
      N: parseInt(n, 10),
      r: parseInt(r, 10),
      p: parseInt(p, 10),
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Minimum bar: 8–200 chars. UI adds a strength meter; server stays lenient
 *  but never accepts trivially short passwords. Returns an error code or null. */
function passwordPolicyError(password) {
  const s = String(password || "");
  if (s.length < 8) return "password_too_short";
  if (s.length > 200) return "password_too_long";
  return null;
}

module.exports = { hashPassword, verifyPassword, passwordPolicyError };
