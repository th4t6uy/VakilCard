// Image upload/removal for VakilCard (photo / UPI QR).
//   POST   /api/vakilcard/upload  { kind: "photo"|"upiqr", data: <base64> }
//   DELETE /api/vakilcard/upload  { kind: "photo"|"upiqr" }
// Auth: VakilCard JWT. The client ships an already
// optimized image (photo: WebP — or JPEG/PNG on browsers without a WebP
// encoder; QR: lossless PNG preferred — see lib/vakilcardImage.js). The
// server independently sniffs the magic bytes (WebP/PNG/JPEG only),
// enforces the size cap, stores exactly ONE object per kind in the public
// `vakilcard` Supabase bucket (older extensions are cleaned up on replace)
// and persists the public URL on the profile itself, so a successful upload
// is never lost even if the client navigates away before saving.
const { resolveAccount, db } = require("./_lib");

// See api/vakilcard/_lib.js for why there is no hardcoded project fallback.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MAX_BYTES = 400 * 1024; // decoded; client targets ≤200 KB (photo) / lossless (QR)

// Accepted formats, by magic bytes — never by client-declared type.
function sniff(buf) {
  const ascii = (a, b) => buf.slice(a, b).toString("ascii");
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return { ext: "webp", mime: "image/webp" };
  if (buf.length >= 8 && buf[0] === 0x89 && ascii(1, 4) === "PNG")
    return { ext: "png", mime: "image/png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { ext: "jpg", mime: "image/jpeg" };
  return null;
}

const EXTS = ["webp", "png", "jpg"];

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function storageDelete(objectPath) {
  try {
    await fetch(`${SUPABASE_URL}/storage/v1/object/vakilcard/${objectPath}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
  } catch {
    /* best effort — replaced objects must never block the flow */
  }
}

/** Persist the (new or cleared) URL on the profile so uploads survive
 *  navigation and the Admin Panel/card always reflect storage reality. */
async function persistUrl(profileId, kind, url) {
  if (kind === "photo") {
    await db(`vakilcard_profiles?id=eq.${profileId}`, {
      method: "PATCH",
      body: { photo_url: url },
      prefer: "return=minimal",
    });
  } else {
    await db("vakilcard_payment_prefs?on_conflict=profile_id", {
      method: "POST",
      body: { profile_id: profileId, upi_qr_url: url },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL) return json(res, 500, { error: "supabase_url_not_configured" });
  if (!SERVICE_KEY) return json(res, 500, { error: "supabase_service_role_key_not_configured" });
  if (req.method !== "POST" && req.method !== "DELETE")
    return json(res, 405, { error: "method_not_allowed" });
  const who = await resolveAccount(req);
  if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });

  try {
    const body = await readBody(req);
    const kind = body.kind === "upiqr" ? "upiqr" : "photo";

    const profiles = await db(`vakilcard_profiles?account_id=eq.${who.accountId}&select=id`);
    if (!profiles.length) return json(res, 404, { error: "no_profile" });
    const profileId = profiles[0].id;

    if (req.method === "DELETE") {
      await Promise.all(EXTS.map((ext) => storageDelete(`${profileId}/${kind}.${ext}`)));
      await persistUrl(profileId, kind, null);
      return json(res, 200, { ok: true });
    }

    const buf = Buffer.from(String(body.data || ""), "base64");
    if (!buf.length) return json(res, 400, { error: "empty" });
    if (buf.length > MAX_BYTES) return json(res, 413, { error: "too_large" });
    const fmt = sniff(buf);
    if (!fmt) return json(res, 415, { error: "unsupported_format" });

    const objectPath = `${profileId}/${kind}.${fmt.ext}`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/vakilcard/${objectPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": fmt.mime,
        "x-upsert": "true",
        "Cache-Control": "public, max-age=86400",
      },
      body: buf,
    });
    if (!r.ok) {
      // 2026-08-17: was a bare 502 with no diagnostic trail — Supabase Storage's
      // own error status/body were discarded, so a real failure (bad bucket
      // config, quota, auth, transient outage — take your pick) was
      // indistinguishable from any other in the logs. Capture both, server-side
      // only: never echo Storage's raw body back to the client (it can include
      // internal detail we don't want to expose to an unauthenticated-looking
      // upload error).
      const errBody = await r.text().catch(() => "<unreadable>");
      console.error(
        `[vakilcard/upload] storage POST failed status=${r.status} bucket=vakilcard ` +
          `path=${objectPath} bytes=${buf.length} mime=${fmt.mime} body=${errBody.slice(0, 1000)}`
      );
      return json(res, 502, { error: "storage_failed", status: r.status });
    }

    // Exactly one object per kind: clear the other extensions after a
    // format change (e.g. WebP re-upload replacing a Safari JPEG).
    await Promise.all(
      EXTS.filter((e) => e !== fmt.ext).map((ext) => storageDelete(`${profileId}/${kind}.${ext}`))
    );

    // Cache-busting query keeps <img> fresh after re-upload of the same path.
    const url = `${SUPABASE_URL}/storage/v1/object/public/vakilcard/${objectPath}?v=${Date.now()}`;
    await persistUrl(profileId, kind, url);
    return json(res, 200, { ok: true, url });
  } catch {
    return json(res, 500, { error: "server_error" });
  }
};
