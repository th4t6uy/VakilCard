// Per-card PWA web app manifest — lets a client (or the lawyer) install a
// specific VakilCard to their home screen as a standalone app.
//   GET /api/vakilcard/manifest?username=<name>
const { resolveProfileOrAlias } = require("./_lib");

// The installable icon is the transparent VakilCard visiting-card artwork
// (rectangular, alpha-preserved). Kept rectangular by design — see the note
// on iOS below.
const ICONS = [
  { src: "/vakilcard-pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/vakilcard-pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
];

module.exports = async function handler(req, res) {
  const username = String(req.query.username || "").replace(/^@/, "").toLowerCase();
  let name = "VakilCard";
  let shortName = "VakilCard";
  const icons = ICONS;
  try {
    let hit = await resolveProfileOrAlias(username);
    if (hit && hit.redirectTo) hit = await resolveProfileOrAlias(hit.redirectTo);
    const p = hit && !hit.draft && hit.profile;
    if (p && p.full_name) {
      // Installed app name → "<First Name> - VakilCard"
      var first = p.full_name.replace(/^adv(ocate)?\.?\s*/i, "").split(/\s+/)[0] || "VakilCard";
      name = `${first} - VakilCard`;
      shortName = `${first} - VakilCard`;
      // Note: photo_url can't be used as a manifest icon (must be same-origin
      // + exact sizes on iOS/Android); the brand icon is universal.
    }
  } catch {
    /* fall back to brand manifest */
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  res.end(
    JSON.stringify({
      name,
      short_name: shortName,
      start_url: `/${username}?src=pwa`,
      scope: `/${username}`,
      display: "standalone",
      orientation: "portrait",
      background_color: "#050508",
      theme_color: "#050508",
      icons,
    })
  );
};
