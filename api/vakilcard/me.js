// Authenticated profile management for VakilCard.
//   GET  /api/vakilcard/me                → own profile bundle
//   GET  /api/vakilcard/me?check=<name>   → username availability
//   POST /api/vakilcard/me                → create/update own profile
//   DELETE /api/vakilcard/me              → delete profile
// Auth: Bearer token — VakilCard session JWT (phone-first identity, the
// only supported identity). Profile ownership is by account_id; DB access
// is service-role (RLS deny-all by design).
//
// Username CHANGES are not handled here — POST /api/vakilcard/account
// {action:"change_username"} owns that flow (permanent-redirect aliases +
// history). This endpoint only sets the username at creation.
const {
  db,
  readJsonBody,
  resolveAccount,
  validateUsername,
  isReservedUsername,
  sanitizeBookingWindows,
} = require("./_lib");
const { sign } = require("./_jwt");
const { entitlementsFor, isProActive, requirePro } = require("./_entitlements");

const SOCIAL_KEYS = ["linkedin", "facebook", "instagram", "x", "threads", "youtube", "whatsapp", "barcouncil"];

function sanitizeSocialLinks(v) {
  if (!v || typeof v !== "object") return {};
  const out = {};
  for (const k of SOCIAL_KEYS) {
    const url = typeof v[k] === "string" ? v[k].trim().slice(0, 300) : "";
    if (/^https?:\/\/[^\s]+$/.test(url)) out[k] = url;
  }
  return out;
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

const str = (v, max = 500) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// Chamber name: free text, sanitized (strip prohibited < > + control chars,
// collapse whitespace, cap length). Mirrors lib/vakilcardNormalize on the client.
const chamberStr = (v) =>
  typeof v === "string"
    ? str(v.replace(/[<>\x00-\x1f\x7f]/g, "").replace(/\s+/g, " "), 60)
    : null;

async function usernameAvailable(raw, ownProfileId) {
  const v = validateUsername(raw);
  if (!v.ok)
    return { available: false, reason: v.reason === "reserved" ? "reserved" : "invalid" };
  const uname = v.uname;
  if (await isReservedUsername(uname)) return { available: false, reason: "reserved" };
  const prof = await db(
    `vakilcard_profiles?username=eq.${encodeURIComponent(uname)}&select=id`
  );
  if (prof.length && prof[0].id !== ownProfileId) return { available: false, reason: "taken" };
  const alias = await db(
    `vakilcard_aliases?alias=eq.${encodeURIComponent(uname)}&select=profile_id`
  );
  if (alias.length && alias[0].profile_id !== ownProfileId)
    return { available: false, reason: "taken" };
  return { available: true };
}

const SEL =
  "*,vakilcard_practice_areas(area,position),vakilcard_offices(*),vakilcard_payment_prefs(*)";

async function loadOwn(accountId) {
  const rows = await db(
    `vakilcard_profiles?account_id=eq.${accountId}&select=${encodeURIComponent(SEL)}`
  );
  return rows[0] || null;
}

module.exports = async function handler(req, res) {
  const who = await resolveAccount(req);
  if (!who) return json(res, 401, { error: "unauthenticated" });

  try {
    let accountId = who.accountId;
    const profile = accountId ? await loadOwn(accountId) : null;

    // Registry "last active" — fire-and-forget so it never slows the request.
    if (accountId) {
      db(`vakilpedia_accounts?id=eq.${accountId}`, {
        method: "PATCH",
        body: { last_active_at: new Date().toISOString() },
        prefer: "return=minimal",
      }).catch(() => {});
    }

    if (req.method === "GET") {
      const check = req.query.check;
      if (check) {
        return json(
          res,
          200,
          await usernameAvailable(String(check).toLowerCase(), profile ? profile.id : null)
        );
      }
      if (req.query.analytics && profile) {
        // Analytics is Pro-only. Events are still RECORDED for free users
        // (track.js) so history exists the day they upgrade — only the READ
        // is entitled.
        if (!requirePro(res, profile, "analytics")) return;
        const events = await db(
          `vakilcard_analytics_events?profile_id=eq.${profile.id}&select=event_type&limit=5000`
        );
        const counts = {};
        for (const e of events) counts[e.event_type] = (counts[e.event_type] || 0) + 1;
        return json(res, 200, { counts });
      }
      // Preview token: lets the wizard iframe the REAL production renderer
      // for a draft (profile.js honors typ:"preview" bound to this profile).
      const preview_token = profile
        ? sign({ pid: profile.id, typ: "preview" }, { expiresInSec: 900 })
        : null;
      return json(res, 200, { profile, preview_token, entitlements: entitlementsFor(profile) });
    }

    if (req.method === "POST") {
      const b = await readJsonBody(req);
      const vu = validateUsername(b.username);
      const uname = vu.ok ? vu.uname : String(b.username || "").toLowerCase();
      const isNew = !profile;

      if (isNew) {
        if (!vu.ok) return json(res, 409, { error: "username_invalid" });
        const avail = await usernameAvailable(uname, null);
        if (!avail.available) return json(res, 409, { error: "username_" + avail.reason });
      } else if (profile.username !== uname) {
        // Renames must go through the alias-preserving account endpoint.
        return json(res, 409, { error: "username_change_requires_account_endpoint" });
      }
      if (!str(b.full_name, 120)) return json(res, 400, { error: "full_name_required" });

      // Website is Pro-only: a free user ADDING or CHANGING a website fails
      // server-side (402). Existing value passing through unchanged is fine
      // (autosave sends the full profile), and clearing is always allowed.
      const pro = isProActive(profile);
      const newWebsite = str(b.website, 500);
      if (!pro && newWebsite && newWebsite !== (profile && profile.website)) {
        return json(res, 402, { error: "pro_required", feature: "website" });
      }
      // Same ADD/CHANGE-only guard for the two other Pro-gated fields that
      // live on the profile row. Clearing or leaving unchanged never 402s —
      // autosave always resends the full profile, so a hard "no writes at
      // all while Free" would 402 every save for a Free user.
      const newReviewLink = str(b.google_review_link, 500);
      if (!pro && newReviewLink && newReviewLink !== (profile && profile.google_review_link)) {
        return json(res, 402, { error: "pro_required", feature: "google_review" });
      }
      const newBusinessUrl = str(b.google_business_url, 500);
      if (!pro && newBusinessUrl && newBusinessUrl !== (profile && profile.google_business_url)) {
        return json(res, 402, { error: "pro_required", feature: "google_business" });
      }
      const newTheme = ["default", "midnight", "ivory"].includes(b.card_theme) ? b.card_theme : "default";
      if (!pro && newTheme !== "default" && newTheme !== (profile && profile.card_theme)) {
        return json(res, 402, { error: "pro_required", feature: "premium_themes" });
      }
      const newHideBranding = typeof b.hide_branding === "boolean" ? b.hide_branding : null;
      if (!pro && newHideBranding !== null && newHideBranding !== (profile && profile.hide_branding)) {
        return json(res, 402, { error: "pro_required", feature: "remove_branding" });
      }
      // Booking windows are Free-tier from day one (fixed-window, one-way
      // booking is a Free feature per product spec) — no entitlement guard.
      const bookingWindows = sanitizeBookingWindows(b.booking_windows);

      if (!accountId) return json(res, 401, { error: "unauthenticated" });

      const profileRow = {
        account_id: accountId,
        username: uname,
        full_name: str(b.full_name, 120),
        designation: str(b.designation, 120),
        enrollment_number: str(b.enrollment_number, 60),
        years_of_practice: Number.isFinite(+b.years_of_practice)
          ? Math.max(0, Math.min(80, Math.round(+b.years_of_practice)))
          : null,
        languages: Array.isArray(b.languages)
          ? b.languages.map((l) => str(l, 40)).filter(Boolean).slice(0, 12)
          : [],
        bio: str(b.bio, 500),
        photo_url: str(b.photo_url, 1000),
        email: str(b.email, 254) || null,
        phone: str(b.phone, 20),
        whatsapp: str(b.whatsapp, 20),
        website: str(b.website, 500),
        show_email: b.show_email !== false,
        show_phone: b.show_phone !== false,
        social_links: sanitizeSocialLinks(b.social_links),
        // Draft-first: publication only changes when the client states it
        // explicitly; otherwise drafts stay drafts and published cards stay
        // published (autosave-safe).
        ...(typeof b.is_published === "boolean"
          ? { is_published: b.is_published }
          : isNew
          ? { is_published: false }
          : {}),
        theme_preference: ["light", "dark", "system"].includes(b.theme_preference)
          ? b.theme_preference
          : "system",
        google_review_link: newReviewLink || null,
        // Deploy-safe: only touch the column when there's something to write
        // or clear — so a deploy that races the additive migration can never
        // break every profile save on an un-migrated database.
        ...(newBusinessUrl || (profile && profile.google_business_url)
          ? { google_business_url: newBusinessUrl || null }
          : {}),
        card_theme: newTheme,
        hide_branding: newHideBranding,
        booking_windows: bookingWindows,
      };

      const [saved] = await db("vakilcard_profiles?on_conflict=account_id", {
        method: "POST",
        body: profileRow,
        prefer: "resolution=merge-duplicates,return=representation",
      });

      if (isNew) {
        await db("vakilcard_aliases?on_conflict=alias", {
          method: "POST",
          body: { alias: uname, profile_id: saved.id, kind: "custom", is_primary: true },
          prefer: "resolution=merge-duplicates,return=minimal",
        });
      }

      // Practice areas: replace-all (simple, ≤15 chips).
      if (Array.isArray(b.practice_areas)) {
        await db(`vakilcard_practice_areas?profile_id=eq.${saved.id}`, {
          method: "DELETE",
          prefer: "return=minimal",
        });
        const areas = b.practice_areas
          .map((a) => str(a, 60))
          .filter(Boolean)
          .slice(0, 15)
          .map((area, i) => ({ profile_id: saved.id, area, position: i }));
        if (areas.length)
          await db("vakilcard_practice_areas", {
            method: "POST",
            body: areas,
            prefer: "return=minimal",
          });
      }

      // Office: single primary office in MVP; replace-all.
      if (b.office && typeof b.office === "object") {
        await db(`vakilcard_offices?profile_id=eq.${saved.id}`, {
          method: "DELETE",
          prefer: "return=minimal",
        });
        const o = b.office;
        if (o.chamber_name || o.address || o.timings || o.maps_url) {
          await db("vakilcard_offices", {
            method: "POST",
            body: {
              profile_id: saved.id,
              chamber_name: chamberStr(o.chamber_name),
              address: str(o.address, 500),
              maps_url: str(o.maps_url, 1000),
              timings: str(o.timings, 200),
              position: 0,
            },
            prefer: "return=minimal",
          });
        }
      }

      // Payment preferences (upsert on profile_id PK).
      if (b.payment && typeof b.payment === "object") {
        await db("vakilcard_payment_prefs?on_conflict=profile_id", {
          method: "POST",
          body: {
            profile_id: saved.id,
            upi_id: str(b.payment.upi_id, 100),
            upi_qr_url: str(b.payment.upi_qr_url, 1000),
            consultation_fee: Number.isFinite(+b.payment.consultation_fee)
              ? Math.max(0, +b.payment.consultation_fee)
              : null,
            show_upi: b.payment.show_upi !== false,
          },
          prefer: "resolution=merge-duplicates,return=minimal",
        });
      }

      return json(res, 200, { ok: true, id: saved.id, username: saved.username });
    }

    if (req.method === "DELETE") {
      if (accountId)
        await db(`vakilcard_profiles?account_id=eq.${accountId}`, {
          method: "DELETE",
          prefer: "return=minimal",
        });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "method_not_allowed" });
  } catch (e) {
    return json(res, 500, { error: "server_error" });
  }
};
