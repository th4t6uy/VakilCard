// Shared helpers for VakilCard serverless endpoints.
// Dependency-free by design (matches api/waitlist). Underscore prefix keeps
// this file from being deployed as an endpoint by Vercel.

// No hardcoded project fallback: a wrong-but-present default here would
// silently point every request at whichever project that literal names —
// a cross-tenant data leak/corruption risk, and the opposite of
// provider-agnostic config. SUPABASE_URL is the canonical server-side var;
// NEXT_PUBLIC_SUPABASE_URL (already required client-side) is reused as a
// fallback since deployments only set one of the two today. Missing both
// throws, matching the existing SERVICE_KEY behavior below.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// ---------------------------------------------------------------------------
// DIAGNOSTIC INSTRUMENTATION (added 2026-07-30 to trace PGRST204 on
// vakilpedia_accounts.password_hash — see supabase/migrations/202607300001_*
// and the DLT report in the same investigation). Additive only: does not
// change db()'s success/error contract, only what gets logged around it.
//
// Two independent sources of "which project are we actually talking to" are
// checked and cross-compared, because a URL string alone isn't proof — the
// key that authenticates the request could belong to a different project
// than the URL names (e.g. a copy/paste mismatch between .env values):
//   1. SUPABASE_URL's own subdomain (https://<ref>.supabase.co)
//   2. the "ref" claim embedded in the SUPABASE_SERVICE_ROLE_KEY JWT itself
//      (Supabase mints service-role keys as JWTs signed with
//      {iss:"supabase", ref:"<project-ref>", role:"service_role", ...})
// If these disagree, every request is guaranteed to hit the wrong database
// (or fail auth) regardless of what either individual value looks like.
function projectRefFromUrl(url) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(String(url || ""));
  return m ? m[1] : null;
}
function projectRefFromServiceKey(jwt) {
  try {
    const payloadB64 = String(jwt || "").split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
    return payload && payload.ref ? payload.ref : null;
  } catch {
    return null; // not a JWT, or malformed — surfaced as null in the boot log below
  }
}
const URL_PROJECT_REF = projectRefFromUrl(SUPABASE_URL);
const KEY_PROJECT_REF = projectRefFromServiceKey(SERVICE_KEY);

// Logged once per cold start (Vercel: once per lambda instance; dev-api-server: once per boot).
// Never logs the key itself — only the project ref it decodes to.
console.log(
  `[vakilcard/db] boot config: url=${SUPABASE_URL ? SUPABASE_URL.replace(/^https:\/\//, "") : "MISSING"} ` +
    `url_ref=${URL_PROJECT_REF || "unparseable"} key_ref=${KEY_PROJECT_REF || "unparseable"} ` +
    `schema=public (default — no Accept-Profile/Content-Profile header is ever sent by this client)`
);
if (SUPABASE_URL && SERVICE_KEY && URL_PROJECT_REF && KEY_PROJECT_REF && URL_PROJECT_REF !== KEY_PROJECT_REF) {
  console.error(
    `[vakilcard/db] CONFIG MISMATCH: SUPABASE_URL points at project "${URL_PROJECT_REF}" but ` +
      `SUPABASE_SERVICE_ROLE_KEY was minted for project "${KEY_PROJECT_REF}". These must be the same ` +
      `project's URL and key pair — mixing them will cause auth failures or (if Supabase ever accepts ` +
      `the mismatched pair) queries silently running against the wrong database. Fix the .env value(s) ` +
      `before investigating anything else.`
  );
}

/**
 * One-shot deep diagnostic for the specific "column not found" (PGRST204)
 * failure mode: fetches PostgREST's own OpenAPI schema descriptor
 * (GET /rest/v1/) and reports whether the column PostgREST currently
 * believes exists on the table actually matches what Postgres has. This is
 * the one HTTP call that can tell apart the two remaining explanations for
 * "Postgres has the column but the API says it doesn't":
 *   (a) PostgREST's schema cache is stale (hasn't picked up a recent DDL
 *       change yet — normally auto-reloaded via Supabase's pgrst_ddl_watch
 *       event trigger, but can still lag), vs.
 *   (b) this request is, in fact, hitting a different project/database than
 *       the one that was inspected/fixed via psql or the Supabase dashboard.
 * Never throws — diagnostics must not become a new failure mode.
 */
async function diagnoseMissingColumn(table, column) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const descriptor = await r.json().catch(() => null);
    const def =
      descriptor &&
      descriptor.definitions &&
      (descriptor.definitions[table] || descriptor.definitions[`public.${table}`]);
    const columnsSeen = def && def.properties ? Object.keys(def.properties) : null;
    const hasColumn = !!(columnsSeen && columnsSeen.includes(column));
    console.error(
      `[vakilcard/db] PGRST204 diagnostic: table=${table} column=${column} ` +
        `url_ref=${URL_PROJECT_REF} key_ref=${KEY_PROJECT_REF} ` +
        `postgrest_descriptor_status=${r.status} ` +
        `postgrest_sees_table=${def ? "yes" : "no"} ` +
        `postgrest_sees_column=${hasColumn ? "yes" : "no"} ` +
        `postgrest_columns_for_table=${columnsSeen ? JSON.stringify(columnsSeen) : "n/a"} ` +
        (def
          ? hasColumn
            ? "-> PostgREST's own schema descriptor DOES include this column right now: the earlier 204 was very likely a transient stale-cache read; if it recurs, issue NOTIFY pgrst, 'reload schema'; or restart the API service for this project."
            : "-> PostgREST's own schema descriptor does NOT include this column: this is either a genuinely stale schema cache (fix: NOTIFY pgrst, 'reload schema'; or restart the project's API service) or this project's Postgres does not actually have the column despite what was checked elsewhere -- re-run the information_schema.columns query against THIS EXACT project ref to be certain."
            : "-> PostgREST does not expose this table AT ALL under this key -- almost certainly the wrong project/schema, or RLS/grants hiding it from this role.")
    );
  } catch (diagErr) {
    console.error(`[vakilcard/db] PGRST204 diagnostic itself failed (network?):`, diagErr && (diagErr.message || diagErr));
  }
}
// ---------------------------------------------------------------------------

/** Minimal PostgREST client using global fetch (Node 18+). */
async function db(path, { method = "GET", body, headers = {}, prefer } = {}) {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL not configured");
  if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  const table = String(path).split(/[?/]/)[0];
  const reqId = Math.random().toString(36).slice(2, 8);
  console.log(`[vakilcard/db][${reqId}] -> ${method} ref=${URL_PROJECT_REF} schema=public table=${table}`);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!r.ok) {
    const msg = (data && (data.message || data.hint)) || `Supabase ${r.status}`;
    console.error(
      `[vakilcard/db][${reqId}] <- ${r.status} ref=${URL_PROJECT_REF} schema=public table=${table} ` +
        `error=${JSON.stringify(data)}`
    );
    const err = new Error(msg);
    err.status = r.status;
    err.detail = data;
    // PGRST204 = "column not found" — trigger the deep, one-shot schema
    // descriptor diagnostic automatically so the follow-up log lines appear
    // right next to the failure, no manual repro needed.
    if (data && data.code === "PGRST204") {
      const m = /'([a-zA-Z_][a-zA-Z0-9_]*)' column of '([a-zA-Z_][a-zA-Z0-9_]*)'/.exec(msg || "");
      const column = m ? m[1] : null;
      const columnTable = m ? m[2] : table;
      if (column) diagnoseMissingColumn(columnTable, column).catch(() => {});
    }
    throw err;
  }
  console.log(
    `[vakilcard/db][${reqId}] <- ${r.status} ref=${URL_PROJECT_REF} schema=public table=${table} ` +
      `rows=${Array.isArray(data) ? data.length : data ? 1 : 0}`
  );
  return data;
}

/** Extract Bearer token from request. */
function bearer(req) {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/**
 * Read the shared Suite/CaseLinx Supabase Auth session out of the incoming
 * request's cookies, if present. This is the VakilCard-side half of the
 * "one sign-in, all apps" bridge (2026-08-15 P0): Suite/CaseLinx set their
 * `sb-<ref>-auth-token` cookie with Domain=".vakilpedia.com" (see
 * Apps/Suite/src/lib/supabase/middleware.ts), so it is automatically present
 * on any request to vakilcard.vakilpedia.com too — VakilCard never has to be
 * told about it, the browser just sends it.
 *
 * @supabase/ssr splits large session cookies into `sb-<ref>-auth-token.0`,
 * `.1`, ... — reassemble in order before decoding. The value itself is
 * `base64-` + base64url(JSON.stringify(session)) per @supabase/ssr's own
 * cookie codec; older/uncommon clients may write plain JSON instead, so both
 * are tried.
 *
 * Returns the raw access_token string, or null if no usable session cookie
 * is present. Never throws — a malformed/foreign cookie just means "no
 * session found", not a hard error (this runs on every unauthenticated page
 * load, it must never be the thing that breaks VakilCard's own flows).
 */
function readSupabaseAccessTokenFromCookies(req) {
  try {
    const raw = req.headers["cookie"];
    if (!raw) return null;
    const jar = {};
    for (const part of raw.split(";")) {
      const i = part.indexOf("=");
      if (i === -1) continue;
      const name = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      if (name) jar[name] = value;
    }
    // Find the auth-token cookie family regardless of project ref or chunking.
    const base = Object.keys(jar).find(
      (n) => n.startsWith("sb-") && n.includes("-auth-token") && !/\.\d+$/.test(n)
    );
    let combined;
    if (base && jar[base] !== undefined) {
      combined = jar[base];
    } else {
      // Chunked form: sb-<ref>-auth-token.0, .1, ... — sort numerically, not
      // lexically (".10" must sort after ".9").
      const chunkPrefix = Object.keys(jar).find((n) => /^sb-.*-auth-token\.0$/.test(n));
      if (!chunkPrefix) return null;
      const stem = chunkPrefix.replace(/\.0$/, "");
      const indices = Object.keys(jar)
        .map((n) => {
          const m = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)$`).exec(n);
          return m ? Number(m[1]) : null;
        })
        .filter((n) => n !== null)
        .sort((a, b) => a - b);
      if (!indices.length) return null;
      combined = indices.map((i) => jar[`${stem}.${i}`]).join("");
    }
    const decodeUriValue = (v) => {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    };
    let jsonText;
    const value = decodeUriValue(combined);
    if (value.startsWith("base64-")) {
      jsonText = Buffer.from(value.slice(7), "base64").toString("utf8");
    } else {
      jsonText = value;
    }
    const parsed = JSON.parse(jsonText);
    // @supabase/ssr has stored the session as either a bare object or a
    // [access_token, refresh_token, ...] tuple across versions — handle both.
    if (Array.isArray(parsed)) return parsed[0] || null;
    return (parsed && (parsed.access_token || parsed.accessToken)) || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Supabase Auth access token (from readSupabaseAccessTokenFromCookies)
 * to its user via GoTrue's own /auth/v1/user — the standard way to validate
 * a user JWT without needing the project's JWT signing secret locally.
 * `apikey` just needs to be a valid project key; VakilCard's existing
 * SERVICE_KEY works fine here and avoids provisioning a second secret.
 * Returns null on any failure (expired token, network error, etc.) — this
 * must fail closed (no bridge login) rather than throw.
 */
async function resolveSupabaseUser(accessToken) {
  if (!SUPABASE_URL || !SERVICE_KEY || !accessToken) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    return data && data.id ? data : null;
  } catch {
    return null;
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** HTML-escape untrusted text for SSR output. */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape for embedding inside a JS string within SSR HTML. */
function jsStr(s) {
  return JSON.stringify(String(s == null ? "" : s));
}

// 3–30 chars; lowercase alnum segments joined by single . _ - separators
// (no leading/trailing/consecutive separators). Matches the DB constraint.
const USERNAME_RE = /^(?=.{3,30}$)[a-z0-9]+([._-][a-z0-9]+)*$/;

// Windows device names — rejected as usernames (defense against filesystem
// tricks in any future export/static tooling).
const WINDOWS_RESERVED = new Set([
  "con", "prn", "aux", "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

/**
 * Full username validation (Phase 2.5 policy):
 *  - NFKC Unicode normalization, then ASCII-only (rejects invisible
 *    characters, homoglyphs and emoji outright)
 *  - lowercase; 3–30 chars (the 1–2 char namespace is reserved by rule)
 *  - alnum segments with single . _ - separators; no leading/trailing/
 *    consecutive separators (also kills path traversal like "..")
 *  - no Windows device names
 *  - not purely numeric: only system-assigned phone usernames are numeric
 *    (pass { allowNumeric: true } for those)
 * Returns { ok: true, uname } or { ok: false, reason }.
 */
function validateUsername(raw, { allowNumeric = false } = {}) {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  const normalized = raw.normalize("NFKC").trim().toLowerCase();
  if (!/^[\x21-\x7e]+$/.test(normalized)) return { ok: false, reason: "invalid_characters" };
  if (!USERNAME_RE.test(normalized)) return { ok: false, reason: "invalid" };
  if (WINDOWS_RESERVED.has(normalized)) return { ok: false, reason: "reserved" };
  if (!allowNumeric && /^[0-9]+$/.test(normalized)) return { ok: false, reason: "numeric_not_allowed" };
  return { ok: true, uname: normalized };
}

/** DB-backed reservation check: enabled rows that haven't expired. */
async function isReservedUsername(uname) {
  const now = new Date().toISOString();
  const rows = await db(
    `reserved_usernames?username=eq.${encodeURIComponent(uname)}&enabled=eq.true&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(now)})&select=username`
  );
  return rows.length > 0;
}

/** Digits-and-plus only, for tel:/wa.me links. */
function cleanPhone(s) {
  return String(s || "").replace(/[^\d+]/g, "");
}

/** Load a full published profile bundle by username. Returns null if absent. */
async function loadProfileBundle(username, { publishedOnly = true } = {}) {
  const uname = String(username || "").toLowerCase();
  if (!USERNAME_RE.test(uname)) return null;
  const sel =
    "*,vakilcard_practice_areas(area,position),vakilcard_offices(*),vakilcard_payment_prefs(*)";
  const filter = publishedOnly ? "&is_published=eq.true" : "";
  const rows = await db(
    `vakilcard_profiles?username=eq.${encodeURIComponent(uname)}${filter}&select=${encodeURIComponent(sel)}`
  );
  if (!rows || !rows.length) return null;
  const p = rows[0];
  p.practice_areas = (p.vakilcard_practice_areas || [])
    .sort((a, b) => a.position - b.position)
    .map((x) => x.area);
  p.offices = (p.vakilcard_offices || []).sort((a, b) => a.position - b.position);
  p.payment = Array.isArray(p.vakilcard_payment_prefs)
    ? p.vakilcard_payment_prefs[0] || null
    : p.vakilcard_payment_prefs || null;
  delete p.vakilcard_practice_areas;
  delete p.vakilcard_offices;
  delete p.vakilcard_payment_prefs;
  return p;
}

/**
 * Resolve a public path segment to a profile, following aliases.
 * Returns { profile } for a primary-username hit, { redirectTo } when the
 * segment is a non-primary alias (permanent redirect — links never break),
 * or null.
 */
async function resolveProfileOrAlias(segment) {
  const uname = String(segment || "").toLowerCase();
  if (!USERNAME_RE.test(uname)) return null;
  // Load regardless of publication; callers must treat draft !== published.
  const direct = await loadProfileBundle(uname, { publishedOnly: false });
  if (direct) {
    return direct.is_published ? { profile: direct } : { draft: true, profile: direct };
  }
  const aliases = await db(
    `vakilcard_aliases?alias=eq.${encodeURIComponent(uname)}&select=profile_id,vakilcard_profiles(username)`
  );
  const a = aliases[0];
  if (a && a.vakilcard_profiles) {
    // Redirect even for drafts — the primary URL then explains "not published".
    return { redirectTo: a.vakilcard_profiles.username };
  }
  return null;
}

/**
 * Resolve the authenticated account from a Bearer token.
 * Accepts a VakilCard session JWT (phone-first identity, the only
 * supported identity — Google/Firebase auth was removed).
 * Returns { accountId, profileId?, via } or null.
 */
async function resolveAccount(req) {
  const token = bearer(req);
  if (!token) return null;
  // Our own JWT — local verification, no network.
  const { verify: verifyJwt } = require("./_jwt");
  const claims = verifyJwt(token);
  if (claims && claims.sub) {
    return { accountId: claims.sub, profileId: claims.pid || null, via: "jwt" };
  }
  return null;
}

/** Fire-and-forget analytics insert. Never throws. */
async function trackEvent(profileId, eventType, referrer) {
  try {
    await db("vakilcard_analytics_events", {
      method: "POST",
      body: { profile_id: profileId, event_type: eventType, referrer: referrer || null },
      prefer: "return=minimal",
    });
  } catch {
    /* analytics must never break the page */
  }
}

// ---------------------------------------------------------------------------
// Booking (Phase 3/4) — shared between me.js (owner saves windows) and
// booking.js (owner reads windows, visitors request slots against them).
// Windows are a small recurring weekly pattern, not a real calendar — see
// api/vakilcard/booking.js's header comment for the Free/Pro split.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate + normalize the owner's weekly availability windows. */
function sanitizeBookingWindows(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((w) => w && TIME_RE.test(w.start) && TIME_RE.test(w.end) && w.start < w.end)
    .map((w) => ({
      day: Math.max(0, Math.min(6, Math.round(+w.day) || 0)), // 0=Sun..6=Sat
      start: w.start,
      end: w.end,
      slot_minutes: [15, 30, 45, 60].includes(+w.slot_minutes) ? +w.slot_minutes : 30,
    }))
    .slice(0, 21);
}

/**
 * Expand the recurring weekly windows into concrete {start,end} ISO slots
 * over the next `days` days. `busy` (Pro only) is an array of {start,end}
 * ISO ranges from Google Calendar freebusy — any generated slot overlapping
 * a busy range is dropped. Free callers pass busy=[] (no calendar check by
 * design — overlapping placeholder bookings are the documented Free
 * behaviour, not a bug).
 */
function expandBookingSlots(windows, { days = 14, busy = [], now = new Date() } = {}) {
  const slots = [];
  const busyRanges = busy
    .map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }))
    .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e));
  const overlapsBusy = (s, e) => busyRanges.some((b) => s < b.e && e > b.s);

  for (let d = 0; d < days; d++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + d);
    const dow = day.getDay();
    for (const w of windows) {
      if (w.day !== dow) continue;
      const [sh, sm] = w.start.split(":").map(Number);
      const [eh, em] = w.end.split(":").map(Number);
      const windowStart = new Date(day); windowStart.setHours(sh, sm, 0, 0);
      const windowEnd = new Date(day); windowEnd.setHours(eh, em, 0, 0);
      for (let t = windowStart.getTime(); t + w.slot_minutes * 60000 <= windowEnd.getTime(); t += w.slot_minutes * 60000) {
        const s = new Date(t), e = new Date(t + w.slot_minutes * 60000);
        if (s <= now) continue; // never offer a slot already in the past
        if (overlapsBusy(s.getTime(), e.getTime())) continue;
        slots.push({ start: s.toISOString(), end: e.toISOString() });
      }
    }
  }
  slots.sort((a, b) => a.start.localeCompare(b.start));
  return slots.slice(0, 200); // hard cap — a 14-day/15-min-slot pathological config never blows up the response
}

module.exports = {
  db,
  bearer,
  readJsonBody,
  esc,
  jsStr,
  USERNAME_RE,
  cleanPhone,
  validateUsername,
  isReservedUsername,
  loadProfileBundle,
  resolveProfileOrAlias,
  resolveAccount,
  readSupabaseAccessTokenFromCookies,
  resolveSupabaseUser,
  trackEvent,
  sanitizeBookingWindows,
  expandBookingSlots,
};
