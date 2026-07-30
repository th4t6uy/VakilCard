// Shared image pipeline for VakilCard uploads (single source of truth —
// used by the setup wizard and any future editor).
//
// Policy (automatic — the user never sees the process; the original file
// never leaves the browser):
//   Display picture: max 5 MB in; decoded, center-cropped square, resized
//     ≤512px, encoded as WebP with quality stepping to ≤200 KB. Browsers
//     that cannot ENCODE WebP via canvas.toBlob (Safari/iOS silently return
//     a PNG instead — the historical cause of every upload failing there)
//     fall back to JPEG, or PNG when the source has transparency.
//   UPI QR: resized ≤640px and kept LOSSLESS (PNG) so the modules stay
//     sharp and scan reliably. Only when a lossless encode can't fit the
//     server cap (camera photos of printed QRs) does it step down to a
//     high-quality (≥0.90) WebP/JPEG — never aggressive compression.
// The server independently re-validates magic bytes + size and stores
// exactly one object per kind (api/vakilcard/upload.js).

const PHOTO_TARGET = 200 * 1024; // soft target for avatars
const HARD_CAP = 380 * 1024; // must stay under the server's 400 KB gate

function decodeFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) return reject(new Error("too_large"));
    if (!/^image\//.test(file.type)) return reject(new Error("not_image"));
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error("decode_failed"));
    };
    img.src = objUrl;
  });
}

function draw(img, { square = false, maxDim = 512 } = {}) {
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (square) {
    const side = Math.min(img.width, img.height);
    sx = (img.width - side) / 2;
    sy = (img.height - side) / 2;
    sw = sh = side;
  }
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Encode; resolves null when the browser can't produce the requested type
 *  (canvas.toBlob silently substitutes PNG for unsupported types). */
function encode(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return resolve(null);
        if (type !== "image/png" && blob.type !== type) return resolve(null);
        resolve(blob);
      },
      type,
      quality
    );
  });
}

/** Sampled alpha check — decides JPEG (opaque) vs PNG (transparency). */
function hasAlpha(canvas) {
  try {
    const ctx = canvas.getContext("2d");
    const step = Math.max(1, Math.floor(Math.max(canvas.width, canvas.height) / 64));
    for (let y = 0; y < canvas.height; y += step) {
      const row = ctx.getImageData(0, y, canvas.width, 1).data;
      for (let x = 3; x < row.length; x += 4 * step) {
        if (row[x] < 255) return true;
      }
    }
  } catch {
    /* tainted canvas can't happen for local files; be safe anyway */
  }
  return false;
}

/** Quality stepping toward a byte budget; returns the best achievable blob. */
async function encodeStepping(canvas, type, { start = 0.85, floor = 0.4, target = PHOTO_TARGET }) {
  let q = start;
  let blob = null;
  for (;;) {
    blob = await encode(canvas, type, q);
    if (!blob) return null; // encoder unsupported
    if (blob.size <= target || q <= floor) return blob;
    q -= 0.15;
    if (q < floor) q = floor;
  }
}

/** Display-picture pipeline: square, ≤512px, visually lossless, ≤~200 KB. */
async function optimizePhoto(img) {
  for (const dim of [512, 448, 384, 320]) {
    const canvas = draw(img, { square: true, maxDim: dim });
    // 1st choice: WebP (best size at equal quality).
    const webp = await encodeStepping(canvas, "image/webp", { target: PHOTO_TARGET });
    if (webp && webp.size <= HARD_CAP) return webp;
    if (webp) continue; // webp worked but too big — try a smaller dim
    // Safari fallback: PNG when transparent, JPEG otherwise.
    if (hasAlpha(canvas)) {
      const png = await encode(canvas, "image/png");
      if (png && png.size <= HARD_CAP) return png;
      // Transparent but oversized at this dim — try smaller dims before
      // flattening; JPEG flatten is the last resort below.
    } else {
      const jpeg = await encodeStepping(canvas, "image/jpeg", { start: 0.9, target: PHOTO_TARGET });
      if (jpeg && jpeg.size <= HARD_CAP) return jpeg;
    }
  }
  // Last resort: flatten to white and JPEG at 320px.
  const canvas = draw(img, { square: true, maxDim: 320 });
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  const jpeg = await encodeStepping(flat, "image/jpeg", { start: 0.85, target: PHOTO_TARGET });
  if (jpeg && jpeg.size <= HARD_CAP) return jpeg;
  throw new Error("encode_failed");
}

/** QR pipeline: sharpness first — lossless PNG, gentle fallbacks only. */
async function optimizeQr(img) {
  for (const dim of [640, 512, 448]) {
    const canvas = draw(img, { square: false, maxDim: dim });
    const png = await encode(canvas, "image/png");
    if (png && png.size <= HARD_CAP) return png;
    // Camera photos of printed QRs don't compress losslessly — use a
    // high-quality lossy encode (never below 0.90: scan reliability).
    for (const q of [0.95, 0.9]) {
      const webp = await encode(canvas, "image/webp", q);
      if (webp && webp.size <= HARD_CAP) return webp;
      const jpeg = await encode(canvas, "image/jpeg", q);
      if (jpeg && jpeg.size <= HARD_CAP) return jpeg;
    }
  }
  throw new Error("encode_failed");
}

/**
 * Optimize a picked file for upload. kind: "photo" | "upiqr".
 * Returns a Blob (webp/jpeg/png) within the server's limits.
 */
export async function optimizeImage(file, { kind = "photo" } = {}) {
  const img = await decodeFile(file);
  return kind === "upiqr" ? optimizeQr(img) : optimizePhoto(img);
}

/**
 * Optimize then upload via the backend (works for phone-JWT and Google
 * sessions alike; server re-validates size + magic bytes and persists the
 * URL on the profile). kind: "photo" | "upiqr". Returns the public URL.
 */
export async function uploadOptimized(file, kind) {
  const blob = await optimizeImage(file, { kind });
  // DEV-ONLY QA session: nothing may touch the backend — preview the
  // optimized image from memory instead (lost on reload, like the session).
  {
    const { qaActive } = await import("./vakilcardQa");
    if (qaActive()) return URL.createObjectURL(blob);
  }
  const base64 = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1]);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
  const { getBearer, ApiError } = await import("./vakilcardApi");
  const bearer = await getBearer();
  const r = await fetch("/api/vakilcard/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ kind, data: base64 }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error || `http_${r.status}`, r.status);
  return data.url;
}

/** Remove the stored image for a kind (server clears the profile URL too). */
export async function removeUpload(kind) {
  {
    const { qaActive } = await import("./vakilcardQa");
    if (qaActive()) return true; // QA session: in-memory only
  }
  const { getBearer, ApiError } = await import("./vakilcardApi");
  const bearer = await getBearer();
  const r = await fetch("/api/vakilcard/upload", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error || `http_${r.status}`, r.status);
  return true;
}
