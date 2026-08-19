// VakilCard operational admin surface — founder-only.
//   GET  /api/vakilcard/admin?action=summary
//        -> { total, free, pro, pending, suspended }
//   GET  /api/vakilcard/admin?action=list&q=&plan=FREE|PRO|ALL&page=1&pageSize=25
//        -> { rows: [...], total, page, pageSize }
//   GET  /api/vakilcard/admin?action=detail&id=<profile_id>
//        -> full profile row + payment prefs + recent subscription events
//   POST { action: "upgrade",   id, founder? }   -> PRO, ACTIVE, +365d, no payment
//   POST { action: "downgrade", id }             -> FREE, ACTIVE
//   POST { action: "grant_trial", id, days }     -> PRO, ACTIVE, +days (default 14)
//   POST { action: "suspend",   id }             -> is_suspended = true
//   POST { action: "unsuspend", id }             -> is_suspended = false
//   POST { action: "delete",    id }             -> hard delete (irreversible)
//
// Auth: session-authed (Bearer JWT, same as every other VakilCard
// endpoint) — NOT a shared secret. The authenticated account's verified
// phone must be in the VAKILCARD_ADMIN_PHONES allowlist. This is
// deliberately the SAME subscription_plan/subscription_status columns
// _entitlements.js reads — never a parallel/fake "admin override" field —
// so entitlement checks everywhere else pick these changes up for free.
const { db, readJsonBody, resolveAccount } = require("./_lib");
const { PRICING } = require("./_entitlements");
const { audit } = require("./_verify");

// Bootstraps to the founder's own number so this works without extra Vercel
// config, but should be overridden explicitly in production — set
// VAKILCARD_ADMIN_PHONES as a comma-separated E.164 list.
const ADMIN_PHONES = (
  process.env.VAKILCARD_ADMIN_PHONES || "+919425388999"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

async function isAdminAccount(accountId) {
  if (!accountId || !ADMIN_PHONES.length) return false;
  const rows = await db(
    `account_phone_identities?account_id=eq.${accountId}&verified_at=not.is.null&select=phone_e164`
  );
  return rows.some((r) => ADMIN_PHONES.includes(r.phone_e164));
}

const LIST_SEL =
  "id,username,full_name,phone,email,subscription_plan,subscription_status," +
  "subscription_expires_at,founder_pricing,is_published,is_suspended,created_at,updated_at";

const SITE = process.env.VAKILCARD_SITE_URL || "https://www.vakilpedia.com";

// ── VakilCard Users registry (Part B/C) ──────────────────────────────────
// Read-only, first-party customer registry. Every VakilCard registration is
// a verified-phone account row, so we drive the registry from
// vakilpedia_accounts (LEFT JOIN phone identity + profile). That means a
// registration still appears even if the user abandoned onboarding before
// choosing a username, setting a password, or publishing a card.
//
// Security: the scrypt hash is NEVER emitted — only a `password_set` boolean.

// Longest-prefix E.164 calling-code lookup. India-first product, so the map
// covers India + common diaspora/business codes; unknown numbers fall back to
// the leading 2 digits. (Full ITU derivation would need a ~240-entry table;
// this stays small and honest for operational display.)
const CALLING_CODES = [
  "1", "7", "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41",
  "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56", "57",
  "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86", "90",
  "91", "92", "93", "94", "95", "98", "212", "213", "216", "218", "220", "233",
  "234", "254", "255", "256", "260", "263", "351", "352", "353", "354", "355",
  "358", "359", "370", "371", "372", "380", "381", "420", "421", "852", "853",
  "855", "856", "870", "880", "886", "960", "961", "962", "963", "964", "965",
  "966", "967", "968", "970", "971", "972", "973", "974", "975", "976", "977",
  "992", "993", "994", "995", "996", "998",
].sort((a, b) => b.length - a.length);

function callingCode(e164) {
  const digits = String(e164 || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  for (const c of CALLING_CODES) if (digits.startsWith(c)) return c;
  return digits.slice(0, 2) || null;
}

// Products this account is registered for. Forward-compatible with AppLinx:
// this registry is VakilCard-scoped today, so every row includes "VakilCard".
// When other Vakilpedia products share vakilpedia_accounts, union their
// memberships here (label per registration_source / product table) — no
// caller or column change required.
const SOURCE_PRODUCT_LABELS = { vakilcard: "VakilCard", applinx: "AppLinx", caselinx: "CaseLinx" };
function productsFor(account) {
  const set = new Set(["VakilCard"]);
  const src = String(account && account.registration_source || "").toLowerCase();
  if (SOURCE_PRODUCT_LABELS[src]) set.add(SOURCE_PRODUCT_LABELS[src]);
  return Array.from(set);
}

/**
 * Build the full, sanitized registry (one row per account). At VakilCard's
 * current scale a few bulk reads + an in-memory merge is simplest and cheapest;
 * revisit with a DB view/pagination if the account count grows large.
 */
async function buildRegistry() {
  const [accounts, identities, profiles] = await Promise.all([
    db(
      "vakilpedia_accounts?select=id,status,password_hash,last_login_at,last_active_at,registration_source,created_at&order=created_at.desc&limit=100000"
    ),
    db(
      "account_phone_identities?select=account_id,phone_e164,verified_at,is_primary,created_at&limit=100000"
    ),
    db(
      "vakilcard_profiles?select=id,account_id,username,full_name,phone,is_published,is_suspended,subscription_plan,subscription_status,created_at,updated_at&limit=100000"
    ),
  ]);

  const identityByAccount = new Map();
  for (const i of identities) {
    const prev = identityByAccount.get(i.account_id);
    // Prefer the primary verified identity when an account has several.
    if (!prev || (i.is_primary && !prev.is_primary)) identityByAccount.set(i.account_id, i);
  }
  const profileByAccount = new Map();
  for (const p of profiles) if (!profileByAccount.has(p.account_id)) profileByAccount.set(p.account_id, p);

  return accounts.map((a) => {
    const idn = identityByAccount.get(a.id) || null;
    const p = profileByAccount.get(a.id) || null;
    const phone = (idn && idn.phone_e164) || (p && p.phone) || null;
    const cardStatus = !p ? "Not Created" : p.is_published ? "Published" : "Draft";
    const isPaid = !!(p && p.subscription_plan === "PRO" && p.subscription_status === "ACTIVE");
    return {
      account_id: a.id,
      profile_id: p ? p.id : null,
      full_name: (p && p.full_name) || null,
      username: (p && p.username) || null,
      phone,
      country_code: callingCode(phone),
      whatsapp_verified: !!(idn && idn.verified_at),
      password_set: !!a.password_hash, // boolean ONLY — hash never leaves server
      card_status: cardStatus,
      is_suspended: !!(p && p.is_suspended),
      products: productsFor(a),
      plan: isPaid ? "Paid" : "Free",
      registration_source: a.registration_source || "vakilcard",
      registration_date: a.created_at,
      last_login: a.last_login_at || null,
      last_active: a.last_active_at || null,
      public_url: p && p.is_published && p.username ? `${SITE}/${p.username}` : null,
    };
  });
}

/** Apply search + facet filters + sort. Pure, operates on registry rows. */
function filterRegistry(rows, { q, verification, plan, card, password, sort }) {
  let out = rows;
  const needle = String(q || "").trim().toLowerCase();
  if (needle) {
    out = out.filter((r) => {
      const hay = `${r.full_name || ""} ${r.username || ""} ${r.phone || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }
  if (verification === "VERIFIED") out = out.filter((r) => r.whatsapp_verified);
  else if (verification === "UNVERIFIED") out = out.filter((r) => !r.whatsapp_verified);

  if (plan === "PAID") out = out.filter((r) => r.plan === "Paid");
  else if (plan === "FREE") out = out.filter((r) => r.plan === "Free");

  if (card === "PUBLISHED") out = out.filter((r) => r.card_status === "Published");
  else if (card === "DRAFT") out = out.filter((r) => r.card_status === "Draft");
  else if (card === "NONE") out = out.filter((r) => r.card_status === "Not Created");

  if (password === "SET") out = out.filter((r) => r.password_set);
  else if (password === "UNSET") out = out.filter((r) => !r.password_set);

  const cmpStr = (a, b) => String(a || "").localeCompare(String(b || ""));
  const ts = (v) => (v ? new Date(v).getTime() : 0);
  if (sort === "ACTIVE") out = [...out].sort((a, b) => ts(b.last_active) - ts(a.last_active));
  else if (sort === "USERNAME") out = [...out].sort((a, b) => cmpStr(a.username, b.username));
  else out = [...out].sort((a, b) => ts(b.registration_date) - ts(a.registration_date)); // NEWEST
  return out;
}

const CSV_COLUMNS = [
  ["full_name", "Full Name"],
  ["username", "Username"],
  ["phone", "Phone Number"],
  ["country_code", "Country Code"],
  ["whatsapp_verified", "WhatsApp Verified"],
  ["password_set", "Password Set"],
  ["card_status", "Card Status"],
  ["products", "Products"],
  ["plan", "Plan"],
  ["registration_source", "Registration Source"],
  ["registration_date", "Registration Date"],
  ["last_login", "Last Login"],
  ["last_active", "Last Activity"],
  ["public_url", "Public Card URL"],
];

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const header = CSV_COLUMNS.map(([, label]) => csvCell(label)).join(",");
  const body = rows
    .map((r) => CSV_COLUMNS.map(([key]) => csvCell(r[key])).join(","))
    .join("\r\n");
  return header + "\r\n" + body + "\r\n";
}

module.exports = async function handler(req, res) {
  try {
    const who = await resolveAccount(req);
    if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
    if (!(await isAdminAccount(who.accountId))) return json(res, 403, { error: "forbidden" });

    if (req.method === "GET") {
      const action = String(req.query?.action || "summary");

      if (action === "summary") {
        // Plain count-selects rather than PostgREST's Content-Range exact
        // count (the minimal fetch client in _lib.js doesn't surface
        // response headers) — fine at VakilCard's current scale.
        const [all, freeRows, proRows, pendingRows, suspendedRows] = await Promise.all([
          db("vakilcard_profiles?select=id"),
          db("vakilcard_profiles?select=id&subscription_plan=eq.FREE"),
          db(
            "vakilcard_profiles?select=id&subscription_plan=eq.PRO&subscription_status=eq.ACTIVE"
          ),
          db("vakilcard_profiles?select=id&is_published=eq.false"),
          db("vakilcard_profiles?select=id&is_suspended=eq.true"),
        ]);
        return json(res, 200, {
          total: all.length,
          free: freeRows.length,
          pro: proRows.length,
          pending: pendingRows.length, // "pending verification" ≈ not yet published
          suspended: suspendedRows.length,
        });
      }

      if (action === "list") {
        const q = String(req.query?.q || "").trim();
        const plan = String(req.query?.plan || "ALL").toUpperCase();
        const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query?.pageSize, 10) || 25));
        const offset = (page - 1) * pageSize;

        let filter = "";
        if (plan === "PRO") filter += "&subscription_plan=eq.PRO";
        else if (plan === "FREE") filter += "&subscription_plan=eq.FREE";
        else if (plan === "SUSPENDED") filter += "&is_suspended=eq.true";
        else if (plan === "PENDING") filter += "&is_published=eq.false";

        let searchFilter = "";
        if (q) {
          const esc = q.replace(/[%,()]/g, "");
          searchFilter =
            `&or=(username.ilike.*${esc}*,full_name.ilike.*${esc}*,phone.ilike.*${esc}*,email.ilike.*${esc}*)`;
        }

        const rows = await db(
          `vakilcard_profiles?select=${LIST_SEL}${filter}${searchFilter}` +
            `&order=created_at.desc&limit=${pageSize}&offset=${offset}`
        );
        return json(res, 200, { rows, page, pageSize });
      }

      if (action === "detail") {
        const id = String(req.query?.id || "");
        if (!id) return json(res, 400, { error: "id_required" });
        const [profileRows, payRows, eventRows] = await Promise.all([
          db(`vakilcard_profiles?id=eq.${id}&select=*`),
          db(`vakilcard_payment_prefs?profile_id=eq.${id}&select=*`),
          db(
            `vakilcard_subscription_events?profile_id=eq.${id}&select=*&order=created_at.desc&limit=20`
          ),
        ]);
        if (!profileRows.length) return json(res, 404, { error: "not_found" });
        return json(res, 200, {
          profile: profileRows[0],
          payment: payRows[0] || null,
          events: eventRows,
        });
      }

      if (action === "registry" || action === "registry_export") {
        const params = {
          q: req.query?.q,
          verification: String(req.query?.verification || "ALL").toUpperCase(),
          plan: String(req.query?.plan || "ALL").toUpperCase(),
          card: String(req.query?.card || "ALL").toUpperCase(),
          password: String(req.query?.password || "ALL").toUpperCase(),
          sort: String(req.query?.sort || "NEWEST").toUpperCase(),
        };
        const all = filterRegistry(await buildRegistry(), params);

        if (action === "registry_export") {
          const csv = toCsv(all);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", 'attachment; filename="vakilcard-users.csv"');
          res.setHeader("Cache-Control", "no-store");
          res.end(csv);
          return;
        }

        const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(req.query?.pageSize, 10) || 25));
        const offset = (page - 1) * pageSize;
        return json(res, 200, {
          rows: all.slice(offset, offset + pageSize),
          total: all.length,
          page,
          pageSize,
        });
      }

      return json(res, 400, { error: "unknown_action" });
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    const body = await readJsonBody(req);
    const action = String(body.action || "");

    // ── WhatsApp campaign send (founder-only, template-driven) ──────────
    // POST { action: "send_template", template, phones: ["+91…"],
    //        body_params_by_phone?: { "+91…": ["Name","FOUNDER33","26 Aug"] },
    //        body_params?: ["…"] }   ← fallback params for every phone
    // Uses MessagingService (_messaging.js): template must exist AND be
    // active in message_templates (i.e. Meta-approved), every send is
    // logged/priced in message_log. Capped per call to keep a typo from
    // blasting the whole registry.
    if (action === "send_template") {
      const templateName = String(body.template || "").trim();
      const phones = Array.isArray(body.phones) ? body.phones.map(String) : [];
      if (!templateName) return json(res, 400, { error: "template_required" });
      if (!phones.length) return json(res, 400, { error: "phones_required" });
      if (phones.length > 100) return json(res, 400, { error: "too_many_phones_max_100" });

      const messaging = require("./_messaging");
      const perPhone = body.body_params_by_phone || {};
      const fallback = Array.isArray(body.body_params) ? body.body_params : [];
      const results = [];
      for (const raw of phones) {
        const phoneE164 = raw.startsWith("+") ? raw : `+${raw}`;
        const bodyParams = Array.isArray(perPhone[phoneE164]) ? perPhone[phoneE164] : fallback;
        // Sequential on purpose — Meta rate-limits bursts, and 14–100 sends
        // finish comfortably inside a serverless invocation.
        const r = await messaging.sendTemplate({
          product: "vakilcard",
          templateName,
          phoneE164,
          bodyParams,
          module: "marketing",
        });
        results.push({ phone: phoneE164, ok: !!r.ok, error: r.ok ? null : r.error || null });
      }
      const sent = results.filter((r) => r.ok).length;
      await audit("admin_campaign_sent", {
        accountId: who.accountId,
        meta: { template: templateName, requested: phones.length, sent },
      });
      return json(res, 200, { ok: true, requested: phones.length, sent, results });
    }

    const id = String(body.id || "");
    if (!id) return json(res, 400, { error: "id_required" });

    const rows = await db(`vakilcard_profiles?id=eq.${id}&select=id,account_id,subscription_plan,subscription_status,subscription_expires_at,founder_pricing`);
    const target = rows[0];
    if (!target) return json(res, 404, { error: "not_found" });

    if (action === "upgrade" || action === "grant_trial") {
      const days = action === "grant_trial" ? Math.max(1, parseInt(body.days, 10) || 14) : PRICING.period_days;
      const renewal = target.subscription_plan === "PRO" && target.subscription_status === "ACTIVE";
      const base =
        renewal && target.subscription_expires_at && new Date(target.subscription_expires_at) > new Date()
          ? new Date(target.subscription_expires_at)
          : new Date();
      const expires = new Date(base.getTime() + days * 864e5).toISOString();
      const founder = action === "upgrade" ? !!body.founder : false;

      await db(`vakilcard_profiles?id=eq.${id}`, {
        method: "PATCH",
        body: {
          subscription_plan: "PRO",
          subscription_status: "ACTIVE",
          subscription_expires_at: expires,
          founder_pricing: founder,
        },
        prefer: "return=minimal",
      });
      await db("vakilcard_subscription_events", {
        method: "POST",
        body: {
          account_id: target.account_id,
          profile_id: id,
          event_type: renewal ? "RENEWED" : "ACTIVATED",
          plan: "PRO",
          price_inr: 0,
          founder_pricing: founder,
          provider: "admin_override",
          provider_ref: who.accountId,
          meta: { granted_by: "admin", action, days },
        },
        prefer: "return=minimal",
      });
      await audit("admin_subscription_upgrade", {
        accountId: who.accountId,
        meta: { target_account_id: target.account_id, profile_id: id, action, expires },
      });
      return json(res, 200, { ok: true, expires_at: expires });
    }

    if (action === "downgrade") {
      await db(`vakilcard_profiles?id=eq.${id}`, {
        method: "PATCH",
        body: { subscription_plan: "FREE", subscription_status: "ACTIVE", subscription_expires_at: null },
        prefer: "return=minimal",
      });
      await db("vakilcard_subscription_events", {
        method: "POST",
        body: {
          account_id: target.account_id,
          profile_id: id,
          event_type: "CANCELLED",
          plan: "FREE",
          price_inr: 0,
          founder_pricing: false,
          provider: "admin_override",
          provider_ref: who.accountId,
          meta: { granted_by: "admin", action: "downgrade" },
        },
        prefer: "return=minimal",
      });
      await audit("admin_subscription_downgrade", {
        accountId: who.accountId,
        meta: { target_account_id: target.account_id, profile_id: id },
      });
      return json(res, 200, { ok: true });
    }

    if (action === "suspend" || action === "unsuspend") {
      await db(`vakilcard_profiles?id=eq.${id}`, {
        method: "PATCH",
        body: { is_suspended: action === "suspend" },
        prefer: "return=minimal",
      });
      await audit(action === "suspend" ? "admin_card_suspended" : "admin_card_unsuspended", {
        accountId: who.accountId,
        meta: { target_account_id: target.account_id, profile_id: id },
      });
      return json(res, 200, { ok: true });
    }

    if (action === "delete") {
      await db(`vakilcard_profiles?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
      await audit("admin_card_deleted", {
        accountId: who.accountId,
        meta: { target_account_id: target.account_id, profile_id: id },
      });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "unknown_action" });
  } catch (e) {
    return json(res, 500, { error: "server_error" });
  }
};
