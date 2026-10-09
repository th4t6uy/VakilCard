// Online-meeting providers for VakilCard booking links (founder, 9 Oct 2026).
//
// Google Meet is the default and is created INSIDE the Google Calendar event the booking already
// makes (events.insert with conferenceData) -- so it needs no extra scope: the calendar.events grant
// VakilCard already holds is enough.
//
// Zoom is deliberately a registered-but-not-ready entry. To add it later: give the `zoom` object a
// `create({ profile, startsAt, endsAt, topic })` that returns { url }, set `ready: true`, and store
// the lawyer's Zoom connection. Nothing in booking.js, the table or the screens changes -- they only
// ever talk to this module by provider key.

const DEFAULT_PROVIDER = "google_meet";

const PROVIDERS = {
  google_meet: {
    key: "google_meet",
    label: "Google Meet",
    ready: true,
    // Lives inside the calendar event: extra query flag + extra event fields.
    calendar: {
      query: "conferenceDataVersion=1",
      eventFields(requestId) {
        return { conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } };
      },
      urlFrom(ev) {
        if (!ev) return null;
        if (ev.hangoutLink) return ev.hangoutLink;
        const eps = (ev.conferenceData && ev.conferenceData.entryPoints) || [];
        const video = eps.find((e) => e && e.entryPointType === "video" && e.uri);
        return video ? video.uri : null;
      },
    },
  },
  zoom: { key: "zoom", label: "Zoom", ready: false },
};

/** A provider key we can actually use today; anything else falls back to the default. */
function pickProvider(key) {
  const p = PROVIDERS[String(key || "")];
  return p && p.ready ? p : PROVIDERS[DEFAULT_PROVIDER];
}

module.exports = { PROVIDERS, DEFAULT_PROVIDER, pickProvider };
