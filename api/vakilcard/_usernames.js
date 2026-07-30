// Username generation for the three-option system.
//   AUTO   (free): [first initial][last initial][last five phone digits],
//                  e.g. "Sidharth Gautam" + …43210 → sg43210. Immutable once
//                  generated (vakilcard_profiles.created_username).
//   PHONE  (free): bare phone digits — explicit consent required.
//   CUSTOM (Pro):  hand-picked; reserved while the subscription is active.

/** Deterministic AUTO username base. Falls back gracefully when the name
 *  has a single word (uses first two letters) or is missing ("vc"). */
function autoUsernameBase(fullName, phoneE164) {
  const words = String(fullName || "")
    .replace(/^adv(ocate)?\.?\s*/i, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let initials;
  if (words.length >= 2) initials = words[0][0] + words[words.length - 1][0];
  else if (words.length === 1) initials = words[0].slice(0, 2).padEnd(2, "x");
  else initials = "vc";
  const digits = String(phoneE164 || "").replace(/\D/g, "");
  const lastFive = digits.slice(-5).padStart(5, "0");
  return `${initials}${lastFive}`;
}

/** Resolve a unique AUTO username: base, then base + random digits on
 *  collision. isTaken(uname) → truthy when unavailable. */
async function generateAutoUsername(fullName, phoneE164, isTaken) {
  const base = autoUsernameBase(fullName, phoneE164);
  if (!(await isTaken(base))) return base;
  for (let i = 0; i < 8; i++) {
    const candidate = base + String(Math.floor(Math.random() * 900) + 100); // 3 random digits
    if (!(await isTaken(candidate))) return candidate;
  }
  // Practically unreachable; timestamp suffix is globally unique enough.
  return base + String(Date.now() % 100000);
}

module.exports = { autoUsernameBase, generateAutoUsername };
