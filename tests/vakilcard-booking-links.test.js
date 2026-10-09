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
const clBody = cl.slice(0, 4000);
assert(!/requirePro\(res, profile, "booking"\)/.test(clBody.split("reusable")[0]), "a plain booking link is FREE: no Pro check before the reusable branch");
assert(/reusable[\s\S]{0,200}requirePro/.test(clBody), "reusable links stay Pro");
assert(/no_hours/.test(clBody) && /calendar_not_connected/.test(clBody), "needs weekly hours and a connected calendar");
assert(/calendar_not_connected/.test(cl.slice(0, 2200)));
// The link is claimed atomically (status=eq.open) before a booking row is written.
assert(/vakilcard_booking_links\?id=eq\.\$\{link\.id\}&status=eq\.open/.test(src));
// Owner bridge: a card shown on www must still recognise its owner (sign-in lives on the dashboard host).
const bridge = fs.readFileSync(path.join(__dirname, "../design_system/vakilcard/owner-bridge.html"), "utf8");
assert(/OK = \{[^}]*"https:\/\/www\.vakilpedia\.com"/.test(bridge), "bridge answers only our own origins");
assert(!/refresh_token:\s*rt\s*\)?\s*[,}]\s*\n?\s*\}?\s*,\s*"/.test(bridge) && !/postMessage\(\{[^}]*refresh/.test(bridge), "bridge never hands out the refresh token");
const mountSrc = fs.readFileSync(path.join(__dirname, "../design_system/vakilcard/mount.js"), "utf8");
assert(/owner-bridge\.html/.test(mountSrc) && /askDashboard\(\)/.test(mountSrc), "mount.js asks the dashboard host when the card is on another origin");
assert(/owner-bridge\.html/.test(fs.readFileSync(path.join(__dirname, "../scripts/build-vakilcard-ds.cjs"), "utf8")), "build copies the bridge");

// Per-link "my own times" (9 Oct 2026): functional check of the pure helpers pulled out of booking.js.
{
  const from = src.indexOf("const MAX_CUSTOM_WINDOWS");
  const to = src.indexOf("function linkBusyDays");
  assert(from > 0 && to > from, "custom-window helpers exist");
  const helpers = new Function(src.slice(from, to) + "\nreturn { cleanCustomWindows, customLinkSlots };")();
  const t0 = Date.now() + 3 * 86400000; // three days ahead, so nothing is in the past
  const w = (h1, h2) => ({ start: new Date(t0 + h1 * 3600000).toISOString(), end: new Date(t0 + h2 * 3600000).toISOString() });
  assert.strictEqual(helpers.cleanCustomWindows("nope").length, 0);
  assert.strictEqual(helpers.cleanCustomWindows([{ start: "x", end: "y" }, w(2, 1)]).length, 0, "bad or reversed windows are dropped");
  assert.strictEqual(helpers.cleanCustomWindows([w(0, 20)]).length, 0, "a window longer than 14 hours is dropped");
  assert.strictEqual(helpers.cleanCustomWindows(Array.from({ length: 20 }, (_, i) => w(i, i + 1))).length, 10, "at most ten windows");
  const slots = helpers.customLinkSlots([w(0, 2)], 30, []);
  assert.strictEqual(slots.length, 4, "a two hour window gives four 30-minute slots");
  const blocked = helpers.customLinkSlots([w(0, 2)], 30, [{ start: w(0.5, 1).start, end: w(0.5, 1).end }]);
  assert.strictEqual(blocked.length, 3, "a busy half hour removes exactly one slot");
  assert.strictEqual(helpers.customLinkSlots([w(0, 2)], 60, []).length, 2, "meeting length sets the step");
  const past = helpers.customLinkSlots([{ start: new Date(Date.now() - 3600000).toISOString(), end: new Date(Date.now() + 3600000).toISOString() }], 30, []);
  assert(past.every((x) => new Date(x.start).getTime() > Date.now()), "never offers a slot already past");
  // create_link takes custom windows in place of weekly hours; link_info / link_book both honour them.
  assert(/custom\.length && !sanitizeBookingWindows|!custom\.length && !sanitizeBookingWindows/.test(src), "no weekly hours needed when the lawyer picks his own times");
  assert(/linkSlots\(L\.profile, L\.link\.duration_minutes,[^;]*L\.link\.custom_windows\)/.test(src), "link_info uses the link's own windows");
  assert(/linkSlots\(profile, link\.duration_minutes,[^;]*link\.custom_windows\)/.test(src), "link_book re-checks against the link's own windows");
}
// The card recognises its owner who is signed in to Vakilpedia only (shared cookie), without making anyone an account.
const authSrc = fs.readFileSync(path.join(__dirname, "../api/vakilcard/auth.js"), "utf8");
assert(/body\.only_profile[\s\S]{0,400}found: false[\s\S]{0,600}owner: true/.test(authSrc), "owner probe returns only for the card's owner");
assert(/only_profile[\s\S]{0,700}const \{ access, refresh \} = await issueTokens/.test(authSrc), "owner probe returns before any refresh token is issued");
assert(/trySuite/.test(mountSrc) && /only_profile: boot\.profileId/.test(mountSrc), "mount.js falls back to the Vakilpedia login");
assert(/Pick my own times/.test(mountSrc) && /custom_windows/.test(mountSrc), "send sheet lets the lawyer pick his own times");
// The link URL is built from the OWNER profile, so that select must include the username (9 Oct 2026:
// links went out as /undefined?book=...).
assert(/async function loadOwnerProfile[\s\S]{0,400}select=id,account_id,username,full_name,/.test(src), "owner profile select includes username and full_name");
// Send sheet (9 Oct 2026): the Email button opened a blank mail app on iPhone, so it is gone; after the link is made a
// "Ready to send" card shows the message with Copy buttons.
assert(!/id="vc-sl-mail"/.test(mountSrc) && !/mailto:/.test(mountSrc.slice(mountSrc.indexOf("function showSendLinkSheet"), mountSrc.indexOf("CLIENT: one picker"))), "no Email button or mailto link in the send sheet");
assert(/showReady\(f, url, mbody\)/.test(mountSrc) && /Ready to send/.test(mountSrc) && /Copy message/.test(mountSrc), "Ready-to-send card with Copy message");
// Wide-screen booking page (9 Oct 2026): Calendly-style page for computers, apps cross-sell, phones keep the sheet.
assert(/function isWide\(\)/.test(mountSrc) && /if \(isWide\(\)\) return renderWebPicker\(opts\)/.test(mountSrc), "picker switches to the web page on wide screens");
assert(/VP_APPS = \[/.test(mountSrc) && /Get your own free VakilCard/.test(mountSrc) && /utm_source=vakilcard/.test(mountSrc), "web page and done sheet carry the Vakilpedia apps and a VakilCard sign-up link");
assert(/if \(isWide\(\)\) return renderWebDone/.test(mountSrc) && /if \(isWide\(\)\) return webDead/.test(mountSrc), "done and dead-link screens have wide versions");
console.log("vakilcard-booking-links: ok");
