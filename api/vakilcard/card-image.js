// The card as a picture — GET /api/vakilcard/card-image?u=<username>[&dl=1]
// Drafts render only with the owner's preview token (&pt=, same token the
// wizard preview uses). Drawn on the server (see _cardRender.js for why).
// Double-tap on the card downloads this; it is also a clean WhatsApp/social
// preview picture.
const { resolveProfileOrAlias } = require("./_lib");
const { verify: verifyJwt } = require("./_jwt");
const { cardFace } = require("./_cardFace");
const { renderCardPng } = require("./_cardRender");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    return res.end();
  }
  const uname = String(req.query.u || "").replace(/^@/, "").toLowerCase();
  try {
    const hit = await resolveProfileOrAlias(uname);
    let p = hit && hit.profile;
    if (hit && hit.redirectTo) {
      res.statusCode = 302;
      const q = new URLSearchParams({ ...req.query, u: hit.redirectTo }).toString();
      res.setHeader("Location", `/api/vakilcard/card-image?${q}`);
      return res.end();
    }
    let isPreview = false;
    if (hit && hit.draft) {
      const claims = req.query.pt ? verifyJwt(String(req.query.pt)) : null;
      if (!(claims && claims.typ === "preview" && claims.pid === p.id)) p = null;
      else isPreview = true;
    }
    if (!p || p.is_suspended) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end("Card not found");
    }
    const png = await renderCardPng(cardFace(p));
    const file = `${(p.full_name || p.username || "vakilcard").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vakilcard"}-vakilcard.png`;
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", png.length);
    res.setHeader("Content-Disposition", `${req.query.dl ? "attachment" : "inline"}; filename="${file}"`);
    // Edits show up within a minute; the page adds &v=<updated_at> anyway.
    res.setHeader(
      "Cache-Control",
      isPreview ? "no-store" : "public, max-age=60, s-maxage=600, stale-while-revalidate=86400"
    );
    res.setHeader("X-Robots-Tag", "noindex");
    return res.end(req.method === "HEAD" ? undefined : png);
  } catch (e) {
    console.error("[vakilcard/card-image] render failed:", e && (e.stack || e.message));
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Could not draw the card");
  }
};
