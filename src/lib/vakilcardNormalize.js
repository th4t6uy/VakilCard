// Shared normalization + validation for VakilCard inputs (single source of
// truth for the onboarding wizard, the dashboard editors and publish gating).
// Philosophy: accept whatever the lawyer types (handles, @handles, bare
// domains, mobile share URLs), normalize to one canonical form, and validate
// the canonical form — never the raw input.

/* ---------------- website ---------------- */

/** "example.com" → "https://example.com"; returns "" for empty input. */
export function normalizeWebsite(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v.replace(/^http:\/\//i, "https://");
  return `https://${v}`;
}

/** True when the normalized URL is a plausible public https URL. */
export function isValidWebsite(raw) {
  const v = normalizeWebsite(raw);
  if (!v) return true; // optional field
  try {
    const u = new URL(v);
    return (
      u.protocol === "https:" &&
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(u.hostname)
    );
  } catch {
    return false;
  }
}

/* ---------------- chamber name ---------------- */

// Chamber name is FREE TEXT — any name the lawyer wants ("Sidharth Gautam Law
// Chambers", "LexPoint Legal", "Justice Square", "Adv. Sidharth Gautam").
// We validate ONLY length + prohibited characters (control chars and markup
// angle brackets); no format is imposed. Mirrored server-side in
// api/vakilcard/me.js (that file is CommonJS and can't import this module).
export const CHAMBER_NAME_MAX = 60;
const CHAMBER_FORBIDDEN = /[<>\x00-\x1f\x7f]/;

/** Strip prohibited chars, collapse whitespace, cap length. Never throws. */
export function sanitizeChamberName(raw) {
  return String(raw || "")
    .replace(/[<>\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAMBER_NAME_MAX);
}

/** Null when valid/empty; otherwise a short human error message. */
export function chamberNameError(raw) {
  const v = String(raw || "");
  if (!v.trim()) return null; // optional
  if (v.trim().length > CHAMBER_NAME_MAX) return `Keep it under ${CHAMBER_NAME_MAX} characters.`;
  if (CHAMBER_FORBIDDEN.test(v)) return "Please remove special characters like < or >.";
  return null;
}

/* ---------------- chamber type (2026-08-16) ----------------
   The small caption line under the chamber name on the card (e.g.
   "LAW CHAMBERS", "LEGAL ASSOCIATES", "ADVOCATES", "& CO") used to be
   forced to the literal "LAW CHAMBERS" whenever chamber_name had 0 or 1
   words — wrong for solo practitioners, associates, firms, or any
   non-chambers practice, and not something a lawyer could opt out of.
   This is its own free-text field (same validation shape as chamber name,
   just a shorter cap since it renders as an all-caps single-line caption)
   so it never has to be guessed from chamber_name's word count. Blank is
   valid and means the caption line is omitted entirely — no forced
   default. Mirrored server-side in api/vakilcard/me.js. */
export const CHAMBER_TYPE_MAX = 30;

/** Strip prohibited chars, collapse whitespace, cap length. Never throws. */
export function sanitizeChamberType(raw) {
  return String(raw || "")
    .replace(/[<>\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAMBER_TYPE_MAX);
}

/** Null when valid/empty; otherwise a short human error message. */
export function chamberTypeError(raw) {
  const v = String(raw || "");
  if (!v.trim()) return null; // optional
  if (v.trim().length > CHAMBER_TYPE_MAX) return `Keep it under ${CHAMBER_TYPE_MAX} characters.`;
  if (CHAMBER_FORBIDDEN.test(v)) return "Please remove special characters like < or >.";
  return null;
}

/* ---------------- UPI ---------------- */

// NPCI VPA: handle@psp — letters/digits/. /- in the handle, letters in the PSP.
export function isValidUpi(raw) {
  const v = String(raw || "").trim();
  if (!v) return true; // optional field
  return /^[a-z0-9][a-z0-9.\-_]{1,48}@[a-z][a-z0-9]{1,30}$/i.test(v);
}

/* ---------------- phone ---------------- */

/** Indian mobile (10 digits starting 6-9), with optional +91/91/0 prefix. */
export function isValidIndianMobile(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const ten = digits.replace(/^(91|0)/, "");
  return /^[6-9]\d{9}$/.test(ten);
}

/* ---------------- social links ---------------- */

// Accept usernames, @handles, mobile/share URLs and full URLs; emit ONE
// canonical https URL per platform. Unknown platforms pass through the
// website rules.
const SOCIAL_CANON = {
  linkedin: {
    base: "https://www.linkedin.com/in/",
    hosts: /(^|\.)linkedin\.com$/i,
    // keep /in/, /company/, /school/ paths as typed; bare handle → /in/
    fromUrl: (u) => `https://www.linkedin.com${u.pathname.replace(/\/+$/, "")}`,
    handle: /^[a-zA-Z0-9\-_.]{3,100}$/,
  },
  x: {
    base: "https://x.com/",
    hosts: /(^|\.)(x|twitter)\.com$/i,
    fromUrl: (u) => `https://x.com/${u.pathname.split("/").filter(Boolean)[0] || ""}`,
    handle: /^[a-zA-Z0-9_]{1,15}$/,
  },
  instagram: {
    base: "https://www.instagram.com/",
    hosts: /(^|\.)instagram\.com$/i,
    fromUrl: (u) => `https://www.instagram.com/${u.pathname.split("/").filter(Boolean)[0] || ""}`,
    handle: /^[a-zA-Z0-9._]{1,30}$/,
  },
  youtube: {
    base: "https://www.youtube.com/@",
    hosts: /(^|\.)(youtube\.com|youtu\.be)$/i,
    fromUrl: (u) => `https://www.youtube.com${u.pathname.replace(/\/+$/, "")}`,
    handle: /^@?[a-zA-Z0-9._\-]{3,30}$/,
    stripAt: true,
  },
  facebook: {
    base: "https://www.facebook.com/",
    hosts: /(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com)$/i,
    fromUrl: (u) => `https://www.facebook.com${u.pathname.replace(/\/+$/, "")}`,
    handle: /^[a-zA-Z0-9.]{5,60}$/,
  },
  threads: {
    base: "https://www.threads.net/@",
    hosts: /(^|\.)(threads\.net|threads\.com)$/i,
    fromUrl: (u) => `https://www.threads.net${u.pathname.replace(/\/+$/, "")}`,
    handle: /^@?[a-zA-Z0-9._]{1,30}$/,
  },
  telegram: {
    base: "https://t.me/",
    hosts: /(^|\.)(t\.me|telegram\.me|telegram\.org)$/i,
    fromUrl: (u) => `https://t.me/${u.pathname.split("/").filter(Boolean)[0] || ""}`,
    handle: /^@?[a-zA-Z0-9_]{5,32}$/,
  },
};

// WhatsApp is phone-based, not handle-based — normalized separately below.
const WA_HOSTS = /(^|\.)(wa\.me|whatsapp\.com|api\.whatsapp\.com|chat\.whatsapp\.com)$/i;

/** "94253 88999" / "+91 94253-88999" / wa.me link → https://wa.me/9194...; null if unusable. */
function normalizeWhatsApp(v) {
  try {
    if (/^https?:\/\//i.test(v) || /^(wa\.me|whatsapp\.com|api\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(v)) {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      if (!WA_HOSTS.test(u.hostname)) return null;
      if (/^chat\.whatsapp\.com$/i.test(u.hostname)) return u.toString(); // group invite — keep as-is
      const digits = (u.pathname.replace(/\D/g, "") || (u.searchParams.get("phone") || "").replace(/\D/g, ""));
      return digits.length >= 10 ? `https://wa.me/${digits}` : null;
    }
  } catch { return null; }
  const digits = v.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `https://wa.me/91${digits}`; // Indian mobile
  if (digits.length >= 11 && digits.length <= 15) return `https://wa.me/${digits.replace(/^0+/, "")}`;
  return null;
}

/**
 * Normalize one social input to a canonical https URL.
 * Returns "" for empty, null for unrecognizable input (caller shows an
 * inline error and the platform is hidden from the card).
 */
export function normalizeSocial(platform, raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (platform === "whatsapp") return normalizeWhatsApp(v);
  const spec = SOCIAL_CANON[platform];

  // Unambiguous URL: has a scheme, a path, or www. — or matches the
  // platform's own host as a bare domain.
  const looksLikeUrl =
    /^https?:\/\//i.test(v) ||
    /^www\./i.test(v) ||
    /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(v) ||
    (spec && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v) && (() => { try { return spec.hosts.test(new URL(`https://${v}`).hostname); } catch { return false; } })());

  // Known platform + not clearly a URL → try the handle interpretation
  // FIRST ("adv.sidharthgautam" is a valid Instagram handle, not a domain).
  if (spec && !looksLikeUrl) {
    const handle = v.replace(/^@/, "");
    return spec.handle.test(handle) ? spec.base + handle : null;
  }

  const asUrl = /^https?:\/\//i.test(v)
    ? v
    : looksLikeUrl || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(v)
      ? `https://${v}`
      : null;
  if (asUrl) {
    try {
      const u = new URL(asUrl);
      if (spec && spec.hosts.test(u.hostname)) return spec.fromUrl(u);
      if (!spec) return isValidWebsite(asUrl) ? normalizeWebsite(asUrl) : null;
      return null; // URL for the wrong platform
    } catch {
      return null;
    }
  }
  return null; // unknown platform, not a URL
}

/** Normalize every entry of a social_links object; drops empties and
 *  unrecognizable values. Returns { links, invalid: [platform,…] }. */
export function normalizeSocialLinks(links) {
  const out = {};
  const invalid = [];
  for (const [k, raw] of Object.entries(links || {})) {
    const n = normalizeSocial(k, raw);
    if (n === null) invalid.push(k);
    else if (n) out[k] = n;
  }
  return { links: out, invalid };
}

/* ---------------- social display list ---------------- */

// Card display order. The DS card maps each key to its own brand icon —
// the key IS the platform, so an icon can never mismatch its link.
export const SOCIAL_DISPLAY_ORDER = [
  "linkedin", "facebook", "instagram", "x", "threads", "youtube",
  "telegram", "whatsapp", "barcouncil",
];

/** Ordered [[platform, canonicalUrl], …] for the card — only populated,
 *  valid links survive; anything unrecognizable is dropped (never a dead
 *  or mismatched icon). */
export function socialDisplayList(social_links) {
  const out = [];
  for (const key of SOCIAL_DISPLAY_ORDER) {
    const raw = (social_links || {})[key];
    if (!raw) continue;
    const n = normalizeSocial(key, raw);
    if (n && /^https:\/\//i.test(n)) out.push([key, n]);
  }
  return out;
}

/* ---------------- publish gating ---------------- */

/**
 * Everything that must be true before a card may be published.
 * Returns [] when publishable, else a list of { field, message }.
 */
export function publishBlockers(f) {
  const out = [];
  if (f.phone && !isValidIndianMobile(f.phone))
    out.push({ field: "phone", message: "Phone number doesn't look like a valid Indian mobile." });
  if (f.whatsapp && !isValidIndianMobile(f.whatsapp))
    out.push({ field: "whatsapp", message: "WhatsApp number doesn't look like a valid Indian mobile." });
  if (f.website && !isValidWebsite(f.website))
    out.push({ field: "website", message: "Website address isn't a valid link." });
  if (f.payment && f.payment.upi_id && !isValidUpi(f.payment.upi_id))
    out.push({ field: "upi", message: "UPI ID should look like name@bank." });
  const { invalid } = normalizeSocialLinks(f.social_links);
  for (const platform of invalid)
    out.push({ field: platform, message: `The ${platform} link isn't recognizable — use the profile URL or your @handle.` });
  return out;
}

/* ---------------- DS profile mapping (client port) ---------------- */

// Client-side port of api/vakilcard/profile.js toDsProfile() — keeps the
// live in-wizard preview pixel-identical to the SSR card. If you change one,
// change the other (both are exercised by tests/vakilcard-verification).
export function formToDsProfile(f) {
  const office = f.office || {};
  const chamber = (office.chamber_name || "").trim();
  const chamberWords = chamber.split(/\s+/).filter(Boolean);
  const nameParts = (f.full_name || "")
    .replace(/^adv(ocate)?\.?\s*/i, "")
    .trim()
    .split(/\s+/);
  const firmShort = chamberWords[0] || nameParts[nameParts.length - 1] || "Chambers";
  // 2026-08-16: firmSub used to default to the literal "LAW CHAMBERS"
  // whenever chamber_name had 0 or 1 words — wrong for solo practitioners,
  // associates, or any non-chambers practice, and impossible to opt out of.
  // Now: an explicit chamber_type field wins when the lawyer has set one
  // (the intentional, discoverable way to customize this caption); falls
  // back to any extra words already typed into chamber_name (unchanged
  // legacy behavior for existing users relying on that); otherwise the
  // caption is omitted entirely rather than fabricated.
  const chamberType = (office.chamber_type || "").trim();
  const firmSub = (chamberType || chamberWords.slice(1).join(" ")).toUpperCase();
  const addrParts = (office.address || "").split(/,\s*/).filter(Boolean);
  const mid = Math.ceil(addrParts.length / 2);
  const contacts = [];
  if (f.show_phone !== false && f.phone) contacts.push(["phone", f.phone]);
  if (f.show_email !== false && f.email) contacts.push(["mail", f.email]);
  if (addrParts.length) contacts.push(["pin", addrParts.slice(-2).join(", ")]);
  if (f.enrollment_number) contacts.push(["scale", `Enrol. No. ${f.enrollment_number}`]);
  const pay = f.payment || {};
  return {
    firmShort,
    firmSub,
    tagline:
      (f.practice_areas || []).slice(0, 3).join(" · ") ||
      "Litigation · Advisory · Drafting",
    title: "ADVOCATE",
    name: f.full_name || "Your Name",
    photoUrl: f.photo_url || "",
    contacts,
    about: f.bio || "",
    practice: f.practice_areas || [],
    upi: pay.show_upi !== false ? pay.upi_id || "" : "",
    social: socialDisplayList(f.social_links),
    // Same fix as firmSub above: no more fabricated "Law Chambers" — the
    // Office/Google Business section already hides this line entirely when
    // falsy (see VakilCardApp.jsx), so an honest empty string is correct.
    firm: chamber || "",
    address: [addrParts.slice(0, mid).join(", "), addrParts.slice(mid).join(", ")],
    // Mirrors profile.js. Pro shows "Leave a Review" (Google's own
    // writeAReviewUri, from the Places link); Free falls back to "View
    // Reviews" on the listing. The preview cannot know the plan, so it shows
    // the Pro label whenever a review link exists on the row -- which is what
    // the owner is deciding about when they look at this.
    reviewLabel: f.google_review_link ? "Leave a Review" : office.maps_url ? "View Reviews" : "Reviews",
    // Mirrors profile.js's Google Business tile: preview it whenever a
    // destination would exist (owner's Google Business link, else the office
    // Maps listing). Entitlement gating stays server-side on the live card —
    // the owner's own preview simply shows what their data unlocks.
    // Free AND Pro, with the real rating when a listing has been linked --
    // same rule as profile.js.
    googleBusiness:
      f.google_business_url || office.maps_url
        ? {
            name: f.google_business_name || chamber || f.full_name || "Your chamber",
            address: addrParts.slice(-2).join(", ") || null,
            ...(typeof f.google_rating === "number" ? { rating: f.google_rating } : {}),
            ...(Number.isFinite(f.google_review_count)
              ? { reviewCount: f.google_review_count }
              : {}),
          }
        : null,
  };
}
