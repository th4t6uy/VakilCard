/**
 * Waitlist wording — ONE text for every Vakilpedia sign-up (founder, 2–3 Oct 2026).
 *
 * Every sign-up, on any app, joins the waitlist. An admin approval (admin panel → People)
 * is what lets a waitlisted person into the apps. Waitlisted people are let in from
 * 12 October 2026; paid plans start 30 October 2026.
 *
 * The same file (same text, same dates) lives in every app that has a sign-up screen:
 *   Account        src/lib/waitlist.ts
 *   www            frontend-next/components/waitlistCopy.js
 *   CaseLinx       src/lib/platform/waitlist.ts
 *   AffidavitMaker src/lib/waitlist.ts
 *   Signlinx       src/lib/waitlist.ts
 *   BareLex        src/lib/waitlist.ts
 *   VakilCard      src/lib/waitlist.js (+ api/vakilcard/_waitlist.js)
 *   CourtQue       backend/waitlist_copy.py
 * Change the dates in ALL of them together.
 *
 * The dates switch themselves off: after 12 Oct the note says "we approve waitlisted
 * members in batches", after 30 Oct the paid-plans line disappears. No stale promises.
 */

/** Day waitlisted people start being let in (IST calendar date). */
const WAITLIST_OPENS_ON = "2026-10-12";
/** Day paid plans start (IST calendar date). */
const PAID_PLANS_START_ON = "2026-10-30";

/** Today's date in India (YYYY-MM-DD), whatever the server or phone time zone is. */
function indiaToday(now = new Date()) {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

const WAITLIST_SIGNUP_TITLE = "Sign up to the waitlist";
const WAITLIST_SIGNUP_BUTTON = "Join the waitlist";
const WAITLIST_PENDING_TITLE = "You're on the waitlist";

/** The dates line: "We let waitlisted members in from 12 October 2026. Paid plans start 30 October 2026." */
function waitlistNote(now = new Date()) {
  const today = indiaToday(now);
  const parts = [];
  parts.push(
    today < WAITLIST_OPENS_ON
      ? "We let waitlisted members in from 12 October 2026."
      : "We approve waitlisted members in batches.",
  );
  if (today < PAID_PLANS_START_ON) parts.push("Paid plans start 30 October 2026.");
  return parts.join(" ");
}

/** Shown under every sign-up heading. */
function waitlistSignupIntro(now = new Date()) {
  return `Every new account joins the waitlist. ${waitlistNote(now)}`;
}

/** Shown (or sent) to someone who has signed up but is not approved yet. */
function waitlistPendingMessage(now = new Date()) {
  return `You're on the Vakilpedia waitlist. ${waitlistNote(now)} We'll let you know as soon as your account is approved.`;
}

/** One-line banner: "Vakilpedia is in beta — every sign-up joins the waitlist. Waitlisted members get in from 12 Oct; paid plans start 30 Oct." */
function waitlistBanner(now = new Date()) {
  const today = indiaToday(now);
  const first =
    today < WAITLIST_OPENS_ON
      ? "Waitlisted members get in from 12 Oct"
      : "We approve waitlisted members in batches";
  const paid = today < PAID_PLANS_START_ON ? "; paid plans start 30 Oct." : ".";
  return `Vakilpedia is in beta — every sign-up joins the waitlist. ${first}${paid}`;
}

/* Hindi (CaseLinx is bilingual). */
const WAITLIST_SIGNUP_TITLE_HI = "वेटलिस्ट में साइन अप करें";
const WAITLIST_SIGNUP_BUTTON_HI = "वेटलिस्ट में शामिल हों";
const WAITLIST_PENDING_TITLE_HI = "आप वेटलिस्ट में हैं";

function waitlistNoteHi(now = new Date()) {
  const today = indiaToday(now);
  const parts = [];
  parts.push(
    today < WAITLIST_OPENS_ON
      ? "वेटलिस्ट के सदस्यों को 12 अक्टूबर 2026 से प्रवेश मिलेगा।"
      : "हम वेटलिस्ट के सदस्यों को बैचों में मंज़ूरी देते हैं।",
  );
  if (today < PAID_PLANS_START_ON) parts.push("पेड प्लान 30 अक्टूबर 2026 से शुरू होंगे।");
  return parts.join(" ");
}

function waitlistSignupIntroHi(now = new Date()) {
  return `हर नया अकाउंट वेटलिस्ट में जुड़ता है। ${waitlistNoteHi(now)}`;
}

function waitlistPendingMessageHi(now = new Date()) {
  return `आप Vakilpedia वेटलिस्ट में हैं। ${waitlistNoteHi(now)} आपका अकाउंट मंज़ूर होते ही हम आपको बताएंगे।`;
}

module.exports = { WAITLIST_OPENS_ON, PAID_PLANS_START_ON, WAITLIST_SIGNUP_TITLE, WAITLIST_SIGNUP_BUTTON, WAITLIST_PENDING_TITLE, waitlistNote, waitlistSignupIntro, waitlistPendingMessage, waitlistBanner, WAITLIST_SIGNUP_TITLE_HI, WAITLIST_SIGNUP_BUTTON_HI, WAITLIST_PENDING_TITLE_HI, waitlistNoteHi, waitlistSignupIntroHi, waitlistPendingMessageHi };
