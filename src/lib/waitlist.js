/**
 * Waitlist wording — ONE text for every Vakilpedia sign-up (founder, 2–3 Oct 2026).
 *
 * Every new account, on any app, joins the waitlist. An admin approval (admin panel → People)
 * is what lets a waitlisted person into the apps. Every sign-up box must say so BEFORE the
 * person signs up — in the sign-in view too, not only after switching to "sign up".
 *
 * Founder, 3 Oct 2026: no dates are announced to the public, and nothing is said about
 * plans. When paid plans start is decided by a switch in the admin panel, never by a date
 * in code — so this file carries no dates and no prices.
 *
 * The same file (same text) lives in every app that has a sign-up screen:
 *   Account        src/lib/waitlist.ts
 *   www            frontend-next/components/waitlistCopy.js
 *   CaseLinx       src/lib/platform/waitlist.ts
 *   AffidavitMaker src/lib/waitlist.ts
 *   Signlinx       src/lib/waitlist.ts
 *   BareLex        src/lib/waitlist.ts
 *   VakilCard      src/lib/waitlist.js (+ api/vakilcard/_waitlist.js)
 *   CourtQue       backend/waitlist_copy.py
 * Change the wording in ALL of them together.
 */

export const WAITLIST_SIGNUP_TITLE = "Sign up to the waitlist";
export const WAITLIST_SIGNUP_BUTTON = "Join the waitlist";
export const WAITLIST_PENDING_TITLE = "You're on the waitlist";
/** The collapsed "sign in or sign up" pill. */
export const WAITLIST_ENTRY_LABEL = "Sign in or join the waitlist";

/** The one-line rule shown in every sign-up box, in sign-in view too. */
export function waitlistNote() {
  return "We approve waitlisted members in batches.";
}

/** Shown in every sign-up box (sign-in view included), before anyone signs up. */
export function waitlistSignupIntro() {
  return `New accounts join the waitlist. ${waitlistNote()}`;
}

/** Shown (or sent) to someone who has signed up but is not approved yet. */
export function waitlistPendingMessage() {
  return `You're on the Vakilpedia waitlist. ${waitlistNote()} We'll let you know as soon as your account is approved.`;
}

/** The pop-up / banner line. */
export function waitlistBanner() {
  return "Vakilpedia is in beta. New accounts join the waitlist — we approve members in batches.";
}

/* Hindi (CaseLinx is bilingual). */
export const WAITLIST_SIGNUP_TITLE_HI = "वेटलिस्ट में साइन अप करें";
export const WAITLIST_SIGNUP_BUTTON_HI = "वेटलिस्ट में शामिल हों";
export const WAITLIST_PENDING_TITLE_HI = "आप वेटलिस्ट में हैं";

export function waitlistNoteHi() {
  return "हम वेटलिस्ट के सदस्यों को बैचों में मंज़ूरी देते हैं।";
}

export function waitlistSignupIntroHi() {
  return `नए अकाउंट वेटलिस्ट में जुड़ते हैं। ${waitlistNoteHi()}`;
}

export function waitlistPendingMessageHi() {
  return `आप Vakilpedia वेटलिस्ट में हैं। ${waitlistNoteHi()} आपका अकाउंट मंज़ूर होते ही हम आपको बताएंगे।`;
}
