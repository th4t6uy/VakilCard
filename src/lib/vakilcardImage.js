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
/** Locate the QR inside a picked image and return a tightly-cropped canvas.
 *  Returns null when nothing is found, so callers fall back to the whole image.
 *
 *  WHY THIS EXISTS. Lawyers upload what their bank app gave them: a full
 *  PhonePe/GPay POSTER -- logo, "ACCEPTED HERE", merchant name, terms -- in
 *  which the QR itself is maybe a third of the frame. The card then renders
 *  that whole poster inside a 190px square, so the actual scannable part is
 *  ~60px and unusable. Cropping to the code turns the same upload into a
 *  full-size, scannable QR, and drops the file size as a side effect.
 *
 *  jsQR is loaded with a dynamic import so it lands in its own chunk and only
 *  downloads when someone actually picks a QR image -- the main bundle is
 *  unchanged. BarcodeDetector would have cost nothing at all, but it does not
 *  exist in iOS Safari, which is exactly where these uploads come from.
 *
 *  DECODING, NOT GUESSING: the crop is taken from a code jsQR successfully
 *  READ, so we never crop to a logo or a block of text that merely looks
 *  dense. If it cannot read one, we leave the image alone. */
async function cropToQr(img) {
  try {
    const maxDim = 1024; // enough detail to decode, cheap enough to scan
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    // A transparent PNG poster decodes as black-on-black without this.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // jsqr ships UMD (module.exports IS the function). Webpack's interop puts
    // that on .default, but take either shape rather than depend on it.
    const mod = await import("jsqr");
    const jsQR = mod && mod.default ? mod.default : mod;
    const data = ctx.getImageData(0, 0, w, h);
    const found = jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" });
    if (!found || !found.location) return null;

    const pts = [
      found.location.topLeftCorner,
      found.location.topRightCorner,
      found.location.bottomLeftCorner,
      found.location.bottomRightCorner,
    ].filter(Boolean);
    if (pts.length < 4) return null;

    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const side = Math.max(x1 - x0, y1 - y0);
    // Sanity: a real QR is a decent fraction of the frame and roughly square.
    if (side < Math.min(w, h) * 0.08) return null;

    // Square it up around the centre, then add a quiet zone. The QR spec wants
    // 4 modules of margin; 10% of the side is a safe stand-in without knowing
    // the module count, and scanners need it to lock on.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const half = side / 2 + side * 0.1;
    x0 = cx - half; y0 = cy - half;
    const box = half * 2;

    const out = document.createElement("canvas");
    const size = Math.max(1, Math.round(box * (1 / scale)));
    out.width = size;
    out.height = size;
    const octx = out.getContext("2d");
    // Pad with the QR's OWN surrounding colour, not white. Plenty of bank
    // posters print a light QR on a dark card; a white quiet zone around one
    // of those inverts the contrast right at the border, which is the edge a
    // scanner locks onto. Sampled just outside the code, and only visible at
    // all when the crop runs past the image edge.
    let pad = "#fff";
    try {
      const sx = Math.max(0, Math.min(w - 1, Math.round(cx - side * 0.6)));
      const sy = Math.max(0, Math.min(h - 1, Math.round(cy - side * 0.6)));
      const px = ctx.getImageData(sx, sy, 1, 1).data;
      pad = "rgb(" + px[0] + "," + px[1] + "," + px[2] + ")";
    } catch (e) {
      /* keep white */
    }
    octx.fillStyle = pad;
    octx.fillRect(0, 0, size, size);
    octx.drawImage(
      img,
      x0 / scale, y0 / scale, box / scale, box / scale,
      0, 0, size, size
    );
    return out;
  } catch (e) {
    return null; // never let this block an upload
  }
}

async function optimizeQr(img) {
  const cropped = await cropToQr(img);
  const source = cropped || img;
  for (const dim of [640, 512, 448]) {
    const canvas = draw(source, { square: false, maxDim: dim });
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
