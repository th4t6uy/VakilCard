// Personal booking links (9 Oct 2026): provider module + dispatch order guarantees.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pickProvider, PROVIDERS, DEFAULT_PROVIDER } = require("../api/vakilcard/_meeting");

// Google Meet is the default; Zoom is registered but not usable yet, so it falls back safely.
assert.strictEqual(DEFAULT_PROVIDER, "google_meet");
assert.strictEqual(pickProvider().key, "google_meet");
assert.strictEqual(pickProvider("zoom").key, "google_meet");
assert.strictEqual(PROVIDERS.zoom.ready, false);

// The calendar request asks Google for a Meet and reads the link back from either place it appears.
const gm = pickProvider("google_meet");
assert.strictEqual(gm.calendar.query, "conferenceDataVersion=1");
const f = gm.calendar.eventFields("req-1");
assert.strictEqual(f.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
assert.strictEqual(gm.calendar.urlFrom({ hangoutLink: "https://meet.google.com/abc-defg-hij" }), "https://meet.google.com/abc-defg-hij");
assert.strictEqual(
  gm.calendar.urlFrom({ conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:1" }, { entryPointType: "video", uri: "https://meet.google.com/x" }] } }),
  "https://meet.google.com/x"
);
assert.strictEqual(gm.calendar.urlFrom({}), null);

// Dispatch order: the two client-facing link actions must sit BEFORE the owner-session gate,
// otherwise a client with no login would get "unauthenticated" (the 2026-08-29 lesson).
const src = fs.readFileSync(path.join(__dirname, "../api/vakilcard/booking.js"), "utf8");
const gate = src.indexOf("await loadOwnerProfile(req)");
assert(gate > 0);
assert(src.indexOf('action === "link_info"') > 0 && src.indexOf('action === "link_info"') < gate);
assert(src.indexOf('action === "link_book"') > 0 && src.indexOf('action === "link_book"') < gate);
assert(src.indexOf('action === "create_link"') > gate, "create_link must need the owner session");
// Creating a link is Pro and needs a writable calendar.
const cl = src.slice(src.indexOf('action === "create_link"'));
const clBody = cl.slice(0, 3000);
assert(!/requirePro\(res, profile, "booking"\)/.test(clBody.split("reusable")[0]), "a plain booking link is FREE: no Pro check before the reusable branch");
assert(/reusable[\s\S]{0,200}requirePro/.test(clBody), "reusable links stay Pro");
assert(/no_hours/.test(clBody) && /calendar_not_connected/.test(clBody), "needs weekly hours and a connected calendar");
assert(/calendar_not_connected/.test(cl.slice(0, 900)));
// The link is claimed atomically (status=eq.open) before a booking row is written.
assert(/vakilcard_booking_links\?id=eq\.\$\{link\.id\}&status=eq\.open/.test(src));
// Owner bridge: a card shown on www must still recognise its owner (sign-in lives on the dashboard host).
const bridge = fs.readFileSync(path.join(__dirname, "../design_system/vakilcard/owner-bridge.html"), "utf8");
assert(/OK = \{[^}]*"https:\/\/www\.vakilpedia\.com"/.test(bridge), "bridge answers only our own origins");
assert(!/refresh_token:\s*rt\s*\)?\s*[,}]\s*\n?\s*\}?\s*,\s*"/.test(bridge) && !/postMessage\(\{[^}]*refresh/.test(bridge), "bridge never hands out the refresh token");
const mountSrc = fs.readFileSync(path.join(__dirname, "../design_system/vakilcard/mount.js"), "utf8");
assert(/owner-bridge\.html/.test(mountSrc) && /askDashboard\(\)/.test(mountSrc), "mount.js asks the dashboard host when the card is on another origin");
assert(/owner-bridge\.html/.test(fs.readFileSync(path.join(__dirname, "../scripts/build-vakilcard-ds.cjs"), "utf8")), "build copies the bridge");
console.log("vakilcard-booking-links: ok");
