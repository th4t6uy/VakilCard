// What goes on the FRONT of a VakilCard — one function, used by the live
// card (profile.js -> toDsProfile) and the downloadable picture
// (card-image.js), so the two can never disagree.
//
// Firm name (founder, 5 Oct 2026): ONE "Firm name" box. Older cards kept a
// second "Firm type" box that was silently cut at 30 letters ("RAYA & CO. —
// SOLICITORS & ADVO"). firmNameOf() merges the two on read, without losing
// text: the type is appended only when it is not already part of the name
// (including the case where it is a cut-off copy of the name).

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function firmNameOf(office) {
  const name = clean(office && office.chamber_name);
  const type = clean(office && office.chamber_type);
  if (!type) return name;
  if (!name) return type;
  const n = name.toLowerCase();
  const t = type.toLowerCase();
  if (n.includes(t) || n.startsWith(t) || t.startsWith(n)) return name.length >= type.length ? name : type;
  return `${name} ${type}`;
}

/** Big first word + small rest, as on a printed card ("Gujral" / "LAW
 *  CHAMBERS"). No fabricated text: an empty firm name falls back to the
 *  lawyer's surname with no caption. */
function firmLines(firm, fullName) {
  const words = clean(firm).split(" ").filter(Boolean);
  if (words.length) return { lead: words[0], rest: words.slice(1).join(" ").toUpperCase() };
  const nameParts = clean(fullName).replace(/^adv(ocate)?\.?\s*/i, "").split(" ").filter(Boolean);
  return { lead: nameParts[nameParts.length - 1] || "Chambers", rest: "" };
}

/** Front-of-card contact rows. The address is shown in FULL (it used to keep
 *  only the last two comma parts, dropping the street). */
function contactRows(p, office) {
  const rows = [];
  if (p.show_phone !== false && p.phone) rows.push(["phone", clean(p.phone)]);
  if (p.show_email !== false && p.email) rows.push(["mail", clean(p.email)]);
  const addr = clean(office && office.address);
  if (addr) rows.push(["pin", addr]);
  if (p.enrollment_number) rows.push(["scale", `Enrol. No. ${clean(p.enrollment_number)}`]);
  return rows;
}

/** p: DB profile row with offices[] joined (or an office object passed in). */
function cardFace(p, officeArg) {
  const office = officeArg || (Array.isArray(p.offices) ? p.offices[0] : p.office) || {};
  const firm = firmNameOf(office);
  const { lead, rest } = firmLines(firm, p.full_name);
  return {
    firm,
    firmShort: lead,
    firmSub: rest,
    name: clean(p.full_name) || "Your Name",
    title: "ADVOCATE",
    tagline: (p.practice_areas || []).slice(0, 3).join(" · ") || "Litigation · Advisory · Drafting",
    photoUrl: p.photo_url || "",
    contacts: contactRows(p, office),
  };
}

module.exports = { cardFace, firmNameOf, firmLines, contactRows };
