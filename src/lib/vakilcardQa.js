// DEVELOPMENT-ONLY QA bypass for the VakilCard onboarding flow.
//
// Purpose: review every frontend onboarding screen while the production
// backend (Meta WhatsApp verification, OTP, Supabase onboarding) is still
// being finished. Entering the QA phone number skips the backend entirely
// and runs the whole flow against an in-memory mock session.
//
// SECURITY — two independent gates, BOTH required:
//   1. `process.env.NODE_ENV === "development"` — a compile-time constant.
//      In production builds CRA inlines "production", so every QA branch
//      below is statically false and the minifier strips this code from the
//      bundle. The bypass cannot exist in a production artifact.
//   2. The hostname must be localhost/127.0.0.1/0.0.0.0 (or an explicitly
//      opted-in dev host via REACT_APP_VAKILCARD_QA_HOST).
// With QA disabled, the QA phone number behaves like any other number.
import React from "react";

export const QA_PHONE = "9425388999";

export function qaEnabled() {
  if (process.env.NODE_ENV !== "development") return false; // compile-time gate
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(host) ||
    (!!process.env.REACT_APP_VAKILCARD_QA_HOST &&
      host === process.env.REACT_APP_VAKILCARD_QA_HOST)
  );
}

/** Exactly the QA number (with or without +91) — and only when QA is enabled. */
export function isQaPhone(phone) {
  if (!qaEnabled()) return false;
  const digits = String(phone || "").replace(/\D/g, "");
  return digits === QA_PHONE || digits === "91" + QA_PHONE;
}

/* ---------------- in-memory mock session (never persisted) ---------------- */

let session = null; // { profile } — module memory only; gone on reload

const MOCK_BASE = {
  id: "qa-00000000-0000-0000-0000-000000000000",
  username: "demo-lawyer",
  full_name: "Adv. Sidharth Gautam",
  designation: "Advocate, High Court",
  enrollment_number: "XX/2214/2016",
  years_of_practice: 8,
  languages: ["English", "Hindi"],
  bio: "Corporate and commercial disputes counsel advising founders, boards, and investors across India.",
  photo_url: "",
  email: "sidharth@example.com",
  phone: "+91 98765 43210",
  whatsapp: "+91 98765 43210",
  website: "",
  show_email: true,
  show_phone: true,
  is_published: false,
  theme_preference: "system",
  social_links: {},
  vakilcard_practice_areas: [
    { area: "Corporate Law", position: 0 },
    { area: "Arbitration", position: 1 },
  ],
  vakilcard_offices: [
    {
      chamber_name: "Sidharth Gautam Law Chambers",
      address: "123 Legal Street, Example City – 110001",
      maps_url: "",
      timings: "Mon–Sat, 10:00 – 18:00",
      position: 0,
    },
  ],
  vakilcard_payment_prefs: [
    { upi_id: "sidharthgautam@example", upi_qr_url: "", consultation_fee: 2000, show_upi: true },
  ],
};

export function startQaSession() {
  if (!qaEnabled()) return null;
  session = { profile: JSON.parse(JSON.stringify(MOCK_BASE)) };
  return {
    ok: true,
    token: "qa-mock-token",
    access_token: "qa-mock-token",
    refresh_token: null, // in-memory only — nothing touches storage
    created: true,
    account_id: "qa-account",
    username: session.profile.username,
    published: false,
    card_url: `https://www.vakilpedia.com/${session.profile.username}`,
    qa: true,
  };
}

export const qaActive = () => qaEnabled() && !!session;
export const endQaSession = () => { session = null; };

/** Preview iframe source for the QA session. The real preview needs a
 *  backend-issued preview token, which doesn't exist in QA — so the Preview
 *  step shows the public demo showcase card (same persona as the mock
 *  session) rendered by production SSR. Read-only, no auth, no backend
 *  writes. */
export const qaPreviewSrc = () =>
  qaActive() ? "https://www.vakilpedia.com/demo" : null;

/** Mock implementations of the API surface the onboarding screens use.
 *  Returns undefined when the path isn't mocked (falls through to real API). */
export async function qaCall(path, { method = "GET", body } = {}) {
  if (!qaActive()) return undefined;
  const p = session.profile;

  if (path.startsWith("me?check=")) {
    const uname = decodeURIComponent(path.split("=")[1] || "").toLowerCase();
    return { available: !["admin", "vakilpedia", "demo"].includes(uname) };
  }
  if (path.startsWith("me?analytics")) {
    return { counts: { view: 42, share: 6, call: 3, whatsapp: 9, pay: 2, directions: 4, save_contact: 5, qr_download: 1 } };
  }
  if (path === "me" && method === "GET") {
    return { profile: JSON.parse(JSON.stringify(p)), preview_token: null, entitlements: qaEntitlements(), qa: true };
  }
  if (path === "me" && method === "POST") {
    Object.assign(p, {
      full_name: body.full_name || p.full_name,
      designation: body.designation ?? p.designation,
      enrollment_number: body.enrollment_number ?? p.enrollment_number,
      years_of_practice: body.years_of_practice ?? p.years_of_practice,
      languages: body.languages || p.languages,
      bio: body.bio ?? p.bio,
      photo_url: body.photo_url ?? p.photo_url,
      email: body.email ?? p.email,
      phone: body.phone ?? p.phone,
      whatsapp: body.whatsapp ?? p.whatsapp,
      website: body.website ?? p.website,
      show_email: body.show_email !== false,
      show_phone: body.show_phone !== false,
      social_links: body.social_links || p.social_links,
      ...(typeof body.is_published === "boolean" ? { is_published: body.is_published } : {}),
    });
    if (Array.isArray(body.practice_areas))
      p.vakilcard_practice_areas = body.practice_areas.map((area, i) => ({ area, position: i }));
    if (body.office) p.vakilcard_offices = [{ ...p.vakilcard_offices[0], ...body.office, position: 0 }];
    if (body.payment) p.vakilcard_payment_prefs = [{ ...p.vakilcard_payment_prefs[0], ...body.payment }];
    return { ok: true, id: p.id, username: p.username, qa: true };
  }
  if (path === "me" && method === "DELETE") { endQaSession(); return { ok: true }; }
  if (path === "account" && method === "GET") {
    return { account_id: "qa-account", phones: [{ phone_e164: "+91" + QA_PHONE, verified_at: new Date().toISOString(), is_primary: true }], oauth: [], profile: { id: p.id, username: p.username }, aliases: [{ alias: p.username, kind: "custom", is_primary: true }] };
  }
  if (path === "account" && method === "POST" && body && body.action === "change_username") {
    if (!session.pro) {
      const e = new Error("pro_required");
      e.code = "pro_required";
      e.status = 402;
      throw e; // mirrors the real 402 → UpgradeSheet trigger
    }
    p.username = String(body.username).toLowerCase();
    return { ok: true, username: p.username, card_url: `https://www.vakilpedia.com/${p.username}`, previous_redirects: true };
  }
  if (path === "account" && method === "POST" && body && body.action === "set_username_auto") {
    const words = String(body.full_name || p.full_name || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
    const initials = words.length >= 2 ? words[0][0] + words[words.length - 1][0] : (words[0] || "vc").slice(0, 2);
    p.username = initials + QA_PHONE.slice(-5);
    return { ok: true, username: p.username, username_source: "AUTO" };
  }
  if (path === "account" && method === "POST" && body && body.action === "set_username_phone") {
    if (body.consent !== true) return { error: "consent_required" };
    p.username = QA_PHONE;
    return { ok: true, username: p.username, username_source: "PHONE" };
  }
  if (path === "subscription" && method === "GET") {
    return qaEntitlements();
  }
  if (path === "subscription" && method === "POST" && body && body.action === "checkout") {
    // QA session: "upgrading" flips the mock to Pro so the whole Pro
    // experience is reviewable without a payment provider.
    session.pro = true;
    return { ok: true, pending: false, qa_activated: true, price_inr: 199, founder_pricing: true };
  }
  if (path === "subscription" && method === "POST" && body && body.action === "cancel") {
    session.pro = false;
    return { ok: true };
  }
  return undefined; // not mocked — real API
}

/** Mock entitlement summary — mirrors api/vakilcard/_entitlements.js. */
function qaEntitlements() {
  const pro = !!(session && session.pro);
  const features = {};
  for (const f of ["custom_username", "native_pay", "website", "booking", "analytics", "premium_themes", "remove_branding"])
    features[f] = pro;
  return {
    plan: pro ? "PRO" : "FREE",
    pro,
    status: "ACTIVE",
    expires_at: null,
    founder_pricing: pro,
    features,
    pricing: { founder_inr: 199, regular_inr: 299, period_days: 365 },
    founder_available: true,
  };
}

/* ---------------- visual indicator ---------------- */

export function QaBadge() {
  if (!qaEnabled() || !session) return null;
  return (
    <div
      style={{ position: "fixed", bottom: 12, left: 12, zIndex: 9999 }}
      className="rounded-full bg-amber-400 text-amber-950 text-[11px] font-black px-3.5 py-1.5 shadow-lg tracking-wide"
    >
      QA MODE · Using Mock Backend
    </div>
  );
}
