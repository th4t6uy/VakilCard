// Downloadable vCard (VCF) for a published VakilCard profile.
const { resolveProfileOrAlias, trackEvent, cleanPhone } = require("./_lib");

function vEsc(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

module.exports = async function handler(req, res) {
  const username = String(req.query.username || "").replace(/^@/, "").toLowerCase();
  try {
    let hit = await resolveProfileOrAlias(username);
    if (hit && hit.redirectTo) hit = await resolveProfileOrAlias(hit.redirectTo);
    // Drafts are not public: no vCard until published.
    const p = hit && !hit.draft && hit.profile;
    if (!p) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    const office = p.offices[0] || {};
    const lines = ["BEGIN:VCARD", "VERSION:3.0"];
    lines.push(`FN:${vEsc(p.full_name)}`);
    const parts = p.full_name.trim().split(/\s+/);
    lines.push(`N:${vEsc(parts.slice(-1)[0])};${vEsc(parts.slice(0, -1).join(" "))};;;`);
    if (p.designation) lines.push(`TITLE:${vEsc(p.designation)}`);
    if (office.chamber_name) lines.push(`ORG:${vEsc(office.chamber_name)}`);
    if (p.show_phone !== false && p.phone)
      lines.push(`TEL;TYPE=CELL:${vEsc(cleanPhone(p.phone))}`);
    if (p.show_email !== false && p.email) lines.push(`EMAIL:${vEsc(p.email)}`);
    if (office.address) lines.push(`ADR;TYPE=WORK:;;${vEsc(office.address)};;;;`);
    if (p.website) lines.push(`URL:${vEsc(p.website)}`);
    lines.push(`URL:https://www.vakilpedia.com/${p.username}`);
    if (p.bio) lines.push(`NOTE:${vEsc(p.bio)}`);
    if (p.photo_url) lines.push(`PHOTO;VALUE=URI:${vEsc(p.photo_url)}`);
    lines.push("END:VCARD");

    trackEvent(p.id, "save_contact", req.headers["referer"]);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/vcard; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${p.username}-vakilcard.vcf"`
    );
    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.end(lines.join("\r\n"));
  } catch {
    res.statusCode = 500;
    res.end("Temporarily unavailable");
  }
};
