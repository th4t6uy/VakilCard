// VakilCard — THE single public entry point (/vakilcard).
//   Signed out → the product landing + WhatsApp OTP (SignupPage), which
//                routes new users into onboarding and existing owners here.
//   Signed in  → Owner Dashboard: live card preview + direct section editing
//                (deep links into /vakilcard/setup?s=…&from=dashboard — a
//                returning owner never replays onboarding), QR, theme,
//                share, publish, analytics, account.
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight, Banknote, Briefcase, CalendarClock, Check, Copy, Download,
  ExternalLink, Eye, Globe2, Image as ImageIcon, Landmark, Link2, Loader2,
  Lock, LogOut, MapPin, Phone, Pencil, Plus, QrCode, Rocket, Share2,
  Smartphone, Sparkles, Star, Trash2, UserRound, X,
} from "lucide-react";
import {
  getMe, getMyAnalytics, getAccount, saveProfile, deleteProfile,
  logout as apiLogout, changePassword as apiChangePassword,
  hasPhoneSession, track, ApiError,
  getBookingConfig, saveBookingWindows, manageBooking, setBookingStatus,
  googleCalendarConnectUrl, disconnectGoogleCalendar,
  linkPhoneStart, linkPhoneVerify,
} from "../lib/vakilcardApi";
import { completionPct, profileToForm } from "./vakilcard/SetupWizard";
import LiveCardPreview from "../components/LiveCardPreview";
import UpgradeSheet from "../components/UpgradeSheet";
import SignupPage, { PasswordInput, StrengthBar } from "./vakilcard/SignupPage";
import BrandWordmark from "../components/BrandWordmark";
import SEOHead from "../components/SEOHead";

// Password errors — kept local since VakilCardPage never shows the full
// onboarding ERRORS map, just the handful relevant to Change Password.
const PW_ERRORS = {
  wrong_current_password: "Current password is incorrect.",
  password_too_short: "New password must be at least 8 characters.",
  password_too_long: "That password is too long (200 characters max).",
  unauthenticated: "Your session expired. Please sign in again.",
};
const pwMsg = (e) => PW_ERRORS[e && e.code] || "Couldn't update your password. Please try again.";

const CARD_ORIGIN = "https://www.vakilpedia.com";
const btn = "rounded-full bg-white border border-slate-200 hover:border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 inline-flex items-center gap-1.5 transition-colors";
const panel = "bg-white/70 backdrop-blur-xl border border-slate-200/70 shadow-sm rounded-[2rem] p-6 sm:p-8";
// Compact variant for tiles that don't need full panel padding (Share,
// Theme) — same visual language, smaller footprint, less scroll.
const panelSm = "bg-white/70 backdrop-blur-xl border border-slate-200/70 shadow-sm rounded-[1.5rem] p-4 sm:p-5";
// Compact button variant to match panelSm — used in the shrunk Share panel.
const btnSm = "rounded-full bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 inline-flex items-center gap-1 transition-colors";

// Short labels by design — these render in a 4-across grid inside a
// half-width panel, so anything longer wraps/hyphenates badly at common
// widths (the bug report that prompted this).
const EVENT_LABELS = [
  ["view", "Views"], ["share", "Shares"], ["call", "Calls"],
  ["whatsapp", "WhatsApp"], ["pay", "Payments"], ["directions", "Directions"],
  ["save_contact", "Contacts"], ["qr_download", "QR scans"],
];

// Vakilpedia ecosystem cross-promotion (dashboard right rail). VakilCard is
// free-forever by design — it's the top of the Vakilpedia funnel. This rail
// is the sales surface: real product art (the same icons used on the
// marketing homepage), not text links, so it reads as "a Vakilpedia
// product" rather than a bolted-on directory. CaseLinx is the featured
// upsell (matches Home.js's hero-card treatment, just compact).
// VakilCard is deployed on its own subdomain (vakilcard.vakilpedia.com), so
// a root-relative href like "/caselinx" resolves to a page on THIS domain
// (404 — VakilCard has no such route) instead of the main site. Every
// cross-sell link must be absolute to CARD_ORIGIN.
const CASELINX = {
  name: "CaseLinx", tag: "the Litigation OS.", badge: "Beta Open",
  desc: "Case diary, cause lists, billing and e-signing — everything your VakilCard clients need you to run in the background.",
  href: `${CARD_ORIGIN}/caselinx`, icon: "/caselinx_icon_v2.png", cta: "Explore CaseLinx",
};
const ECOSYSTEM = [
  ["IPC / BNS Converter", "Old-to-new criminal law sections, instantly.", `${CARD_ORIGIN}/ipc-to-bns-converter`, null, "/ipc_bns_converter_icon.png"],
  ["EvidenceHash", "SHA-256 hashing for digital evidence.", `${CARD_ORIGIN}/evidence-hash-sha256`, null, "/evidencehash_icon.png"],
  ["Vakilnama", "The Vakilpedia publication for lawyers.", `${CARD_ORIGIN}/vakilnama`, null, "/Vakilnama_cover.png"],
  ["CourtQue", "Display-board alerts on WhatsApp.", `${CARD_ORIGIN}/courtque`, "New", "/courtque_icon_v3.png"],
];

function EcosystemRail({ compactGrid = false }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-slate-200/70 shadow-sm rounded-[2rem] p-5">
      <div className="flex items-center gap-2 mb-4">
        <img src="/logo.png" alt="" className="h-5 w-auto object-contain flex-none" />
        <p className="text-xs font-black uppercase tracking-widest text-[#635BFF]">More from <BrandWordmark /></p>
      </div>

      {/* Featured: CaseLinx — the sale this whole rail exists to make */}
      <a
        href={CASELINX.href}
        className="group relative block rounded-[1.75rem] p-5 mb-3 overflow-hidden bg-gradient-to-br from-indigo-50/90 via-white to-blue-50/70 border-2 border-indigo-200 hover:border-[#635BFF] hover:shadow-lg hover:shadow-indigo-100 transition-all no-underline"
      >
        <span className="absolute top-4 right-4 bg-[#635BFF] text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">{CASELINX.badge}</span>
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white shadow-sm grid place-items-center mb-3">
          <img src={CASELINX.icon} alt="CaseLinx" className="w-full h-full object-cover" />
        </div>
        <p className="text-lg font-black text-slate-900 tracking-tight leading-none">{CASELINX.name}</p>
        <p className="text-[#635BFF] font-bold text-xs mt-1">{CASELINX.tag}</p>
        <p className="text-xs text-slate-600 mt-2 text-left hyphens-none leading-snug">{CASELINX.desc}</p>
        <span className="inline-flex items-center gap-1 text-xs font-black text-slate-900 group-hover:text-[#635BFF] group-hover:gap-2 transition-all mt-3">
          {CASELINX.cta}<ArrowRight className="h-3.5 w-3.5" />
        </span>
      </a>

      <div className={compactGrid ? "grid sm:grid-cols-2 xl:grid-cols-4 gap-3" : "space-y-3"}>
        {ECOSYSTEM.map(([name, desc, href, badge, icon]) => (
          <a
            key={name}
            href={href}
            className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200 hover:border-[#635BFF]/50 hover:shadow-sm transition-all p-3 no-underline"
          >
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-50 shadow-sm grid place-items-center flex-none">
              <img src={icon} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-black text-slate-900 truncate">{name}</p>
                {badge && <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 flex-none">{badge}</span>}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 text-left hyphens-none leading-snug line-clamp-2">{desc}</p>
            </div>
          </a>
        ))}
      </div>
      <p className="text-[11px] font-bold text-slate-400 text-center pt-3">More products coming soon</p>
    </div>
  );
}

// Every editable section opens DIRECTLY — no wizard replay.
const EDIT_SECTIONS = [
  ["photo", "Profile picture", ImageIcon],
  ["details", "Profile & bio", UserRound],
  ["practice", "Practice areas", Briefcase],
  ["contact", "Contact & website", Phone],
  ["office", "Office address", Landmark],
  ["payment", "Payment settings", Banknote],
  ["presence", "Social links", Globe2],
];

// "Users only buy what they can see." — every Pro capability is always
// visible here, Free or Pro; Free renders it as a locked row with a PRO
// badge that opens the ONE UpgradeSheet, Pro renders its real (or
// honestly-labelled "coming soon") status. Never hidden, never a dead tap.
// `key` must exist in api/vakilcard/_entitlements.js's PRO_FEATURES.
const PRO_TOOLS = [
  { key: "website", icon: Globe2, title: "Personal website button", freeDesc: "Add a live link to your own site on your card.", proDesc: "Set your site under Contact & website — it goes live on your card." },
  { key: "native_pay", icon: Banknote, title: "Native UPI payments", freeDesc: "Clients pay your consultation fee — or any amount — in one tap via their own UPI app.", proDesc: "Active — clients tapping Pay choose your consultation fee or a custom amount, then their UPI app." },
  { key: "booking", icon: CalendarClock, title: "Smart appointment booking", freeDesc: "Basic booking is already on — upgrade for Google Calendar sync so you're never double-booked, plus payment-before-confirmation.", proDesc: "Set up below — connect Google Calendar and require payment before a slot is confirmed." },
  { key: "remove_branding", icon: Sparkles, title: "Remove Vakilpedia branding", freeDesc: "Your card, only your name — no \"Powered by Vakilpedia\".", proDesc: "Toggle it off in Theme below." },
  { key: "google_review", icon: Star, title: "Get more reviews", freeDesc: "A direct \"Leave a review\" button straight to Google.", proDesc: "Add your review link in Booking & Reviews below." },
  { key: "google_business", icon: MapPin, title: "Google Business tile", freeDesc: "Your Google listing as a native tile on your card — reviews, photos, directions in one tap.", proDesc: "Add your Google Business link in Booking & Reviews below — the tile appears on your card." },
];

function ProToolRow({ tool, pro, onLocked }) {
  const Icon = tool.icon;
  return (
    <button
      type="button"
      onClick={() => (pro ? null : onLocked(tool.key))}
      className={`w-full rounded-2xl border p-4 text-left transition-colors flex items-start gap-3 ${pro ? "border-slate-200 bg-slate-50 cursor-default" : "border-slate-200 bg-white hover:border-[#635BFF]/50"}`}
    >
      <span className={`h-9 w-9 rounded-xl flex items-center justify-center flex-none ${pro ? "bg-emerald-100" : "bg-[#635BFF]/10"}`}>
        <Icon className={`h-4 w-4 ${pro ? "text-emerald-700" : "text-[#635BFF]"}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black text-slate-900">{tool.title}</p>
          {!pro && <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[10px] font-black uppercase tracking-wider px-2 py-0.5 flex-none">Pro</span>}
        </div>
        <p className="text-xs text-slate-500 mt-1 text-left hyphens-none">{pro ? tool.proDesc : tool.freeDesc}</p>
      </div>
    </button>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Booking & Reviews — the one panel covering Phase 3 (Free windows-based
// booking + appointment inbox), Phase 4 (Pro Google Calendar connect +
// payment-confirmation actions) and the review-link half of Phase 5.
// "Users only buy what they can see": Free owners see and use real booking
// here today; the Pro-only rows (calendar sync, review link) render locked
// with the same UpgradeSheet trigger as everywhere else.
// A "group" is one row in the editor: a time range + slot length applied to
// however many days the owner picks (e.g. Mon–Fri, one row, not five). The
// server still stores one flat {day,start,end,slot_minutes} entry per day
// (booking.js/sanitizeBookingWindows is unchanged) — grouping/flattening
// happens only here, client-side, purely for a calendar-like picking UX.
function groupWindows(flat) {
  const groups = [];
  for (const w of flat || []) {
    const g = groups.find((g) => g.start === w.start && g.end === w.end && g.slot_minutes === w.slot_minutes);
    if (g) g.days.push(w.day);
    else groups.push({ id: `${w.start}-${w.end}-${w.slot_minutes}-${groups.length}`, days: [w.day], start: w.start, end: w.end, slot_minutes: w.slot_minutes });
  }
  return groups;
}
function flattenGroups(groups) {
  const out = [];
  for (const g of groups) {
    for (const day of g.days) out.push({ day, start: g.start, end: g.end, slot_minutes: g.slot_minutes });
  }
  return out;
}
let groupIdSeq = 0;

function BookingPanel({ pro, initialReviewLink, initialBusinessUrl, onSaveReviewLink, onSaveBusinessUrl, onUpgrade }) {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [savingWindows, setSavingWindows] = useState(false);
  const [reviewLink, setReviewLink] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [businessUrl, setBusinessUrl] = useState("");
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");

  // Prefill the Pro link inputs with what's already saved — previously the
  // review-link box always opened empty, so "Save" with a blank box could
  // silently wipe an existing link.
  useEffect(() => { if (initialReviewLink) setReviewLink(initialReviewLink); }, [initialReviewLink]);
  useEffect(() => { if (initialBusinessUrl) setBusinessUrl(initialBusinessUrl); }, [initialBusinessUrl]);

  const load = useCallback(() => {
    setLoading(true);
    getBookingConfig()
      .then((c) => { setCfg(c); setGroups(groupWindows(c && c.windows)); })
      .catch(() => setCfg(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const addGroup = () => setGroups([...groups, { id: `new-${groupIdSeq++}`, days: [], start: "10:00", end: "13:00", slot_minutes: 30 }]);
  const removeGroup = (id) => setGroups(groups.filter((g) => g.id !== id));
  const updateGroup = (id, patch) => setGroups(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const toggleDay = (id, day) =>
    setGroups(groups.map((g) => (g.id === id ? { ...g, days: g.days.includes(day) ? g.days.filter((d) => d !== day) : [...g.days, day].sort() } : g)));

  const saveWindows = async () => {
    setSavingWindows(true);
    setErr("");
    try {
      const flat = flattenGroups(groups.filter((g) => g.days.length));
      const r = await saveBookingWindows(flat);
      setCfg((c) => ({ ...c, windows: r.windows }));
      setGroups(groupWindows(r.windows));
    } catch {
      setErr("Couldn't save your availability — please try again.");
    } finally {
      setSavingWindows(false);
    }
  };

  const saveReviewLink = async () => {
    setSavingReview(true);
    setErr("");
    try {
      await onSaveReviewLink(reviewLink);
    } catch {
      setErr("Couldn't save your review link.");
    } finally {
      setSavingReview(false);
    }
  };

  const saveBusinessUrl = async () => {
    setSavingBusiness(true);
    setErr("");
    try {
      await onSaveBusinessUrl(businessUrl);
    } catch {
      setErr("Couldn't save your Google Business link.");
    } finally {
      setSavingBusiness(false);
    }
  };

  const connectCalendar = async () => {
    window.location.href = await googleCalendarConnectUrl();
  };
  const disconnectCalendar = async () => {
    await disconnectGoogleCalendar();
    load();
  };

  const act = async (id, fn) => {
    setBusyId(id);
    setErr("");
    try {
      await fn();
      load();
    } catch {
      setErr("That action didn't go through — please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={panel}>
      <h2 className="text-xl font-black tracking-tight text-slate-900 mb-4">Booking &amp; Reviews</h2>

      <p className="text-sm font-bold text-slate-800 mb-2">Weekly availability</p>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {DAY_LABELS.map((d, di) => (
                  <button
                    key={di}
                    type="button"
                    onClick={() => toggleDay(g.id, di)}
                    aria-pressed={g.days.includes(di)}
                    className={`h-9 w-9 rounded-full text-xs font-black transition-colors ${
                      g.days.includes(di) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {d[0]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="time" value={g.start} onChange={(e) => updateGroup(g.id, { start: e.target.value })} className="rounded-xl border border-slate-200 text-sm px-2 py-1.5" />
                <span className="text-slate-400 text-sm">to</span>
                <input type="time" value={g.end} onChange={(e) => updateGroup(g.id, { end: e.target.value })} className="rounded-xl border border-slate-200 text-sm px-2 py-1.5" />
                <select value={g.slot_minutes} onChange={(e) => updateGroup(g.id, { slot_minutes: +e.target.value })} className="rounded-xl border border-slate-200 text-sm px-2 py-1.5">
                  {[15, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
                <button type="button" onClick={() => removeGroup(g.id)} className="ml-auto text-rose-600" aria-label="Remove this availability row"><X className="h-4 w-4" /></button>
              </div>
              {!g.days.length && <p className="text-xs text-amber-600 mt-2">Pick at least one day — this row won't be saved otherwise.</p>}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={addGroup} className={btn}><Plus className="h-4 w-4" />Add availability</button>
            <button type="button" onClick={saveWindows} disabled={savingWindows} className="rounded-full bg-slate-900 text-white hover:bg-[#635BFF] px-4 py-2 text-sm font-bold disabled:opacity-50 transition-colors">
              {savingWindows ? "Saving…" : "Save availability"}
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500 mt-2 hyphens-none">Live on your card today — no calendar check on Free, so avoid double-listing the same hours elsewhere. Tap the day circles to pick which days a time range applies to (e.g. Mon–Fri in one row).</p>

      <div className="mt-6 pt-5 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Google Calendar sync</p>
          {!pro && <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Pro</span>}
        </div>
        {!pro ? (
          <button type="button" onClick={() => onUpgrade("booking")} className="text-sm font-bold text-[#635BFF] mt-1">Upgrade to stop double-bookings →</button>
        ) : !cfg || !cfg.calendar_platform_configured ? (
          <p className="text-xs text-slate-500 mt-1 hyphens-none">Not switched on for this deployment yet — contact support.</p>
        ) : cfg.calendar_connected ? (
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm text-emerald-700 font-bold inline-flex items-center gap-1"><Check className="h-4 w-4" />Connected</span>
            <button type="button" onClick={disconnectCalendar} className="text-xs font-bold text-slate-500 underline">Disconnect</button>
          </div>
        ) : (
          <button type="button" onClick={connectCalendar} className={btn + " mt-2"}><CalendarClock className="h-4 w-4" />Connect Google Calendar</button>
        )}
      </div>

      <div className="mt-6 pt-5 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Google review link</p>
          {!pro && <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Pro</span>}
        </div>
        {!pro ? (
          <>
            <p className="text-xs text-slate-500 mt-1 hyphens-none">Free shows a "View Reviews" link to your office's Google listing. Upgrade for a direct "Leave a Review" button.</p>
            <button type="button" onClick={() => onUpgrade("google_review")} className="text-sm font-bold text-[#635BFF] mt-1">See what you get →</button>
          </>
        ) : (
          <div className="flex flex-wrap gap-2 mt-2">
            <input
              value={reviewLink}
              onChange={(e) => setReviewLink(e.target.value)}
              placeholder="https://g.page/r/.../review"
              className="flex-1 min-w-[220px] rounded-xl border border-slate-200 text-sm px-3 py-2"
            />
            <button type="button" onClick={saveReviewLink} disabled={savingReview} className="rounded-full bg-slate-900 text-white hover:bg-[#635BFF] px-4 py-2 text-sm font-bold disabled:opacity-50 transition-colors">
              {savingReview ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 pt-5 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Google Business tile</p>
          {!pro && <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Pro</span>}
        </div>
        {!pro ? (
          <>
            <p className="text-xs text-slate-500 mt-1 hyphens-none">A native Google tile on your card — visitors tap it to open your Google Business profile with all your reviews and photos.</p>
            <button type="button" onClick={() => onUpgrade("google_business")} className="text-sm font-bold text-[#635BFF] mt-1">See what you get →</button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500 mt-1 mb-2 hyphens-none">Paste your Google Business / Maps listing link (from your listing's Share button). Without one, the tile uses your office's Maps link automatically.</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={businessUrl}
                onChange={(e) => setBusinessUrl(e.target.value)}
                placeholder="https://maps.app.goo.gl/…  or  https://g.co/kgs/…"
                className="flex-1 min-w-[220px] rounded-xl border border-slate-200 text-sm px-3 py-2"
              />
              <button type="button" onClick={saveBusinessUrl} disabled={savingBusiness} className="rounded-full bg-slate-900 text-white hover:bg-[#635BFF] px-4 py-2 text-sm font-bold disabled:opacity-50 transition-colors">
                {savingBusiness ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 pt-5 border-t border-slate-200">
        <p className="text-sm font-bold text-slate-800 mb-2">Appointment requests</p>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !cfg || !cfg.requests || !cfg.requests.length ? (
          <p className="text-sm text-slate-500">No requests yet.</p>
        ) : (
          <div className="space-y-2">
            {cfg.requests.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">{r.client_name} <span className="text-slate-400 font-normal">· {r.client_phone}</span></p>
                  <span className={`rounded-full text-[10px] font-black uppercase px-2 py-0.5 flex-none ${
                    r.status === "confirmed" ? "bg-emerald-100 text-emerald-700" :
                    r.status === "declined" ? "bg-rose-100 text-rose-700" :
                    r.status === "completed" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700"
                  }`}>{r.status}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{r.starts_at ? new Date(r.starts_at).toLocaleString("en-IN") : r.requested_slot}</p>
                {r.purpose && <p className="text-xs text-slate-500 mt-1 hyphens-none">{r.purpose}</p>}
                {r.is_pro_booking && r.payment_status !== "not_required" && (
                  <p className={`text-xs mt-1 font-bold ${r.payment_status === "confirmed" ? "text-emerald-700" : "text-amber-700"}`}>
                    Payment: {r.payment_status.replace("_", " ")}{r.amount_inr ? ` (₹${r.amount_inr})` : ""}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 mt-2">
                  {r.is_pro_booking && ["pending", "claimed_paid"].includes(r.payment_status) && (
                    <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, () => manageBooking(r.id, "confirm_payment_received"))} className="text-xs font-bold text-emerald-700 underline">Mark payment received</button>
                  )}
                  {r.status === "pending" && (
                    <>
                      <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, () => setBookingStatus(r.id, "confirmed"))} className="text-xs font-bold text-emerald-700 underline">Confirm</button>
                      <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, () => setBookingStatus(r.id, "declined"))} className="text-xs font-bold text-rose-700 underline">Decline</button>
                    </>
                  )}
                  {r.status === "confirmed" && (
                    <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, () => setBookingStatus(r.id, "completed"))} className="text-xs font-bold text-slate-600 underline">Mark completed</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {err && <p className="text-sm font-semibold text-rose-700 mt-4">{err}</p>}
    </div>
  );
}

export default function VakilCardPage() {
  const navigate = useNavigate();
  const { username: routeUsername } = useParams(); // set on /:username/dashboard
  const [profile, setProfile] = useState(undefined); // undefined=loading, null=none
  const [counts, setCounts] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showA2HS, setShowA2HS] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null); // Android beforeinstallprompt
  const [publishing, setPublishing] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingCardTheme, setSavingCardTheme] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [ent, setEnt] = useState(null); // entitlements from GET /me
  const [upgradeFeature, setUpgradeFeature] = useState(null); // null | feature key

  // Change Password (Account panel) — hasPassword null until we know;
  // account.js reports it via has_password so the UI can say "Set a
  // password" (no current one yet) vs "Change password".
  const [hasPassword, setHasPassword] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);

  // Add-phone nudge (Google-only signups) — unlocks WhatsApp booking alerts.
  // Optional and skippable; nothing else in the dashboard depends on it.
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneStep, setPhoneStep] = useState("enter"); // enter | code
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneErr, setPhoneErr] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw1, setNewPw1] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwDone, setPwDone] = useState(false);

  // Phone (WhatsApp OTP) session check. hasPhoneSession() reads localStorage
  // synchronously, so no async "auth state resolving" placeholder is needed
  // here. Google sign-in issues the exact same session (see auth.js
  // action=google_signin) — it just arrives via a different front door, so
  // this one check still covers both.
  const authed = hasPhoneSession();

  // ?auth=google — an inbound link from the marketing site's own "Sign in
  // with Google" button (Apps/Vakilpedia-code, PR #11). That button can't
  // authenticate anything itself (no shared session/secret between the two
  // origins — see SignupPage.js's Google sign-in comments), so it just
  // drops the visitor here with a hint to open Google immediately instead
  // of making them click twice. Captured once via a lazy initializer so a
  // later param strip (below) can't un-set it mid-session; ignored entirely
  // when already signed in, per the acceptance criteria.
  const [autoGoogleSignIn] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("auth") === "google";
  });
  useEffect(() => {
    if (!autoGoogleSignIn) return;
    // Strip immediately — not gated on whether the prompt actually fires —
    // so a refresh or back-navigation never re-triggers it. `from` is
    // attribution-only per the handoff and isn't read for any logic; it's
    // dropped here too so the visible URL just goes clean.
    const url = new URL(window.location.href);
    url.searchParams.delete("auth");
    url.searchParams.delete("from");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [autoGoogleSignIn]);

  useEffect(() => {
    document.title = "VakilCard — One Link. Everything Your Client Needs. | Vakilpedia";
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    setProfile(undefined);
    try {
      const r = await getMe();
      setProfile(r.profile || null);
      setEnt(r.entitlements || null);
      // Analytics is Pro-only (server 402s for free) — the locked panel
      // below is the free experience.
      if (r.profile && r.entitlements && r.entitlements.pro)
        getMyAnalytics().then((a) => setCounts(a.counts)).catch(() => {});
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setProfile(null);
      else setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (authed) load();
    else setProfile(null);
  }, [authed, load]);

  useEffect(() => {
    if (!authed) return;
    getAccount().then((a) => setHasPassword(!!a.has_password)).catch(() => {});
  }, [authed]);

  // Keep the dashboard URL canonical: /:username/dashboard. Runs once
  // the signed-in owner's profile is known.
  //  • / (no username) → the owner's dashboard URL
  //  • a stale/mismatched username in the URL → the owner's own dashboard
  // Deep links and refreshes keep working: auth is re-established on load and
  // this effect re-runs with the resolved profile.
  useEffect(() => {
    if (!authed || !profile || !profile.username) return;
    if (routeUsername !== profile.username) {
      navigate(`/${profile.username}/dashboard`, { replace: true });
    }
  }, [authed, profile, routeUsername, navigate]);

  // Prompt every new mobile owner to add their card to the Home Screen — until
  // they actually install it (display-mode: standalone). Auto-opens the install
  // hint once; owners can reopen it any time via the button. Skipped once the
  // card is installed, or if the owner has already been shown + acted.
  useEffect(() => {
    if (!authed || !profile) return;
    const standalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
    const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent || "");
    if (!isMobile || standalone) return;
    let seen = false;
    try { seen = localStorage.getItem("vc_dash_a2hs_seen") === "1"; } catch {}
    if (!seen) {
      setShowA2HS(true);
      try { localStorage.setItem("vc_dash_a2hs_seen", "1"); } catch {}
    }
  }, [authed, profile]);

  // Android/Chrome: capture the install event so owners can add the PWA in ONE
  // tap from the popup (no ⋮ menu hunting). iOS has no such API → manual hint.
  useEffect(() => {
    const onBip = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);
  const doInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch {}
    setInstallPrompt(null);
  };

  const submitChangePassword = async () => {
    setPwErr("");
    setPwDone(false);
    if (hasPassword && !curPw) return setPwErr("Enter your current password.");
    if (newPw1.length < 8) return setPwErr("New password must be at least 8 characters.");
    if (newPw1 !== newPw2) return setPwErr("Passwords don't match.");
    setPwSaving(true);
    try {
      await apiChangePassword(curPw, newPw1);
      setHasPassword(true);
      setPwDone(true);
      setCurPw(""); setNewPw1(""); setNewPw2("");
      setTimeout(() => { setPwOpen(false); setPwDone(false); }, 1500);
    } catch (e) {
      setPwErr(pwMsg(e));
    } finally {
      setPwSaving(false);
    }
  };

  const sendPhoneCode = async () => {
    setPhoneErr("");
    if (!phoneInput.trim()) return;
    setPhoneBusy(true);
    try {
      await linkPhoneStart(phoneInput.trim());
      setPhoneStep("code");
    } catch (e) {
      setPhoneErr(e && e.code === "invalid_phone" ? "That doesn't look like a valid mobile number." : "Couldn't send a code — please try again.");
    } finally {
      setPhoneBusy(false);
    }
  };
  const verifyPhoneCode = async () => {
    setPhoneErr("");
    if (!phoneCode.trim()) return;
    setPhoneBusy(true);
    try {
      await linkPhoneVerify(phoneInput.trim(), phoneCode.trim());
      setPhoneOpen(false);
      setPhoneStep("enter");
      setPhoneInput("");
      setPhoneCode("");
      load(); // refresh profile.phone so the nudge disappears and WhatsApp alerts activate
    } catch (e) {
      setPhoneErr(
        e && e.code === "phone_already_linked"
          ? "That number is already linked to a different VakilCard account."
          : "That code didn't match — please try again."
      );
    } finally {
      setPhoneBusy(false);
    }
  };

  const url = profile ? `${CARD_ORIGIN}/${profile.username}` : "";

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      if (alive) setQrUrl(qr.createDataURL(10, 4));
    });
    return () => { alive = false; };
  }, [profile, url]);

  const doLogout = async () => {
    await apiLogout();
    setProfile(null);
  };

  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    track("share", profile.id);
    setTimeout(() => setCopied(false), 1800);
  };

  const share = () => {
    track("share", profile.id);
    if (navigator.share) navigator.share({ title: `${profile.full_name} | VakilCard`, url }).catch(() => {});
    else copy();
  };

  // me.js rebuilds the whole row from the body — always send the FULL
  // profile (partial bodies would null the missing fields).
  const saveFull = async (extra) => {
    const full = profileToForm(profile);
    await saveProfile({ ...full, full_name: full.full_name || profile.full_name || "Advocate", ...extra });
  };

  const publish = async () => {
    setPublishing(true);
    try {
      await saveFull({ is_published: true });
      track("published", profile.id);
      await load();
    } finally {
      setPublishing(false);
    }
  };

  const setTheme = async (theme) => {
    setSavingTheme(true);
    try {
      await saveFull({ theme_preference: theme, is_published: profile.is_published === true });
      setProfile((p) => ({ ...p, theme_preference: theme }));
    } finally {
      setSavingTheme(false);
    }
  };

  // Pro-only — server-side me.js 402s these for Free (ADD/CHANGE-only guard),
  // but the buttons are only reachable when `pro` is already true here.
  const setCardTheme = async (card_theme) => {
    setSavingCardTheme(true);
    try {
      await saveFull({ card_theme, is_published: profile.is_published === true });
      setProfile((p) => ({ ...p, card_theme }));
    } finally {
      setSavingCardTheme(false);
    }
  };

  const setHideBranding = async (hide_branding) => {
    setSavingBranding(true);
    try {
      await saveFull({ hide_branding, is_published: profile.is_published === true });
      setProfile((p) => ({ ...p, hide_branding }));
    } finally {
      setSavingBranding(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete your VakilCard permanently? Your username will be released — but per policy it can never be claimed by anyone else.")) return;
    await deleteProfile();
    load();
  };

  /* ---------- render ---------- */

  const shell = (children) => (
    <div className="min-h-screen" style={{ background: "linear-gradient(120deg, rgba(205,239,251,.35), rgba(253,238,203,.35)), #fff" }}>
      <div className="vp-container py-10 sm:py-14">{children}</div>
    </div>
  );

  // Signed out → single entry point: the full landing + OTP experience.
  // SignupPage itself routes post-verification (new → onboarding,
  // existing → back here as the dashboard).
  if (!authed) {
    return (
      <>
        <SEOHead 
          title="VakilCard | Free Digital Business Card for Indian Advocates"
          description="Create your free digital chamber card. Share office location, directions, contact info, practice areas, and receive UPI payments instantly."
          keywords="VakilCard, digital business card lawyers India, chamber card advocates, digital profile advocates, UPI payments lawyers"
          canonicalUrl="https://vakilcard.vakilpedia.com/"
          imageUrl="https://www.vakilpedia.com/logo.png"
        />
        <SignupPage autoGoogleSignIn={autoGoogleSignIn} />
      </>
    );
  }

  // Loading / error
  if (profile === undefined) {
    return shell(
      loadError ? (
        <div className="text-center py-24">
          <p className="text-slate-600">Couldn't load your VakilCard.</p>
          <button className="mt-4 rounded-full bg-slate-900 text-white px-6 py-3 font-bold" onClick={load}>Retry</button>
        </div>
      ) : (
        <div className="space-y-4 animate-pulse py-6">
          <div className="h-10 bg-white/70 rounded-2xl w-1/2" />
          <div className="h-48 bg-white/70 rounded-[2.5rem]" />
          <div className="h-32 bg-white/70 rounded-[2rem]" />
        </div>
      )
    );
  }

  // Authed but no card yet.
  if (!profile) {
    return shell(
      <div className="text-center py-16">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">No VakilCard yet</h1>
        <p className="text-slate-600 mt-3">Create one in under three minutes — verified on WhatsApp.</p>
        <button onClick={doLogout} className="mt-6 rounded-full bg-slate-900 text-white hover:bg-[#635BFF] px-8 py-4 font-bold transition-colors">
          Start with your WhatsApp number
        </button>
      </div>
    );
  }

  const form = profileToForm(profile);
  const pct = completionPct(form);
  const published = profile.is_published === true;
  const theme = profile.theme_preference || "system";
  const pro = !!(ent && ent.pro);

  return shell(
    <>
      <SEOHead 
        title="VakilCard | Dashboard"
        description="Manage your VakilCard profile, view analytics, download QR, and share your digital chamber card."
        canonicalUrl="https://vakilcard.vakilpedia.com/"
        imageUrl="https://www.vakilpedia.com/logo.png"
      />
      {/* Vakilpedia product lockup — this is a Vakilpedia product page, not
          a standalone app. Mirrors Home.js's navbar logo treatment. */}
      <a href="/" className="flex items-center gap-2.5 mb-6 no-underline w-fit">
        <img src="/logo.png" alt="Vakilpedia" className="h-7 sm:h-8 w-auto object-contain" />
        <BrandWordmark className="font-black text-slate-900 tracking-tighter text-lg sm:text-xl" />
        <span className="rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 ml-1">VakilCard</span>
      </a>

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <img src="/vakilcard-pwa-192.png" alt="" className="hidden sm:block h-9 w-9 rounded-xl object-cover shadow-sm flex-none" />
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">My VakilCard</h1>
          {/* current plan — always visible */}
          <span className={`rounded-full text-[11px] font-black uppercase tracking-wider px-3 py-1 ${pro ? "bg-[#635BFF] text-white" : "bg-slate-200 text-slate-600"}`}>
            {pro ? "Pro" : "Free"}
          </span>
        </div>
        <button onClick={doLogout} className={btn}><LogOut className="h-4 w-4" />Sign out</button>
      </div>

      {/* Three columns on xl: content | live card | ecosystem. On lg the
          ecosystem rail folds beneath the main column. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_360px_260px] 2xl:grid-cols-[minmax(0,1fr)_420px_300px] lg:gap-8 2xl:gap-10 lg:items-start">
        <div className="space-y-6">
          {/* status */}
          <div className={panel}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${published ? "bg-emerald-500" : "bg-amber-400"}`} />
                  <p className="text-sm font-bold text-slate-500">{published ? "Live" : "Draft — not public yet"}</p>
                </div>
                <a href={published ? url : undefined} target="_blank" rel="noopener noreferrer"
                   className={`text-lg sm:text-xl font-black break-words inline-flex flex-wrap items-center gap-1.5 leading-tight ${published ? "text-[#635BFF] hover:underline" : "text-slate-400 cursor-default"}`}>
                  <span>vakilpedia.com/<wbr />{profile.username}</span>{published && <ExternalLink className="h-4 w-4 flex-none" />}
                </a>
                <div className="mt-4">
                  <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                    <span>Card completion</span><span className="text-[#635BFF]">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#635BFF] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-5">
                  <button onClick={publish} disabled={publishing} className="rounded-full bg-slate-900 text-white hover:bg-[#635BFF] px-4 py-2 text-sm font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50">
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                    {published ? "Publish changes" : "Publish"}
                  </button>
                  {published && (
                    <a className={btn + " no-underline"} href={url} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" />View live</a>
                  )}
                </div>
              </div>
              {qrUrl ? (
                <img src={qrUrl} alt={`QR code for ${url}`} className="h-32 w-32 rounded-2xl border border-slate-200 bg-white p-1 self-center" />
              ) : (
                <div className="h-32 w-32 rounded-2xl border border-slate-200 bg-white flex items-center justify-center self-center"><QrCode className="h-8 w-8 text-slate-300" /></div>
              )}
            </div>
          </div>

          {/* tasteful upgrade card — free plan only, never intrusive */}
          {!pro && (
            <button
              type="button"
              onClick={() => setUpgradeFeature("pro")}
              className="w-full text-left rounded-[2rem] border border-[#635BFF]/25 bg-gradient-to-r from-[#635BFF]/8 to-transparent hover:from-[#635BFF]/12 transition-colors p-5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-slate-900">VakilCard Pro — ₹199/year founder price</p>
                  <p className="text-xs text-slate-500 mt-1 text-left hyphens-none">Custom username · Native Pay · Website · Booking · Analytics · No branding</p>
                </div>
                <span className="rounded-full bg-slate-900 text-white text-xs font-bold px-4 py-2 flex-none">Upgrade</span>
              </div>
            </button>
          )}

          {/* analytics + account side-by-side on xl */}
          <div className="grid gap-6 xl:grid-cols-2">
          <div className={panel}>
            <h2 className="text-xl font-black tracking-tight text-slate-900 mb-4">Analytics</h2>
            {!pro ? (
              <div className="text-center py-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 select-none" aria-hidden="true" style={{ filter: "blur(6px)", opacity: 0.5 }}>
                  {EVENT_LABELS.map(([k, label]) => (
                    <div key={k} className="text-center">
                      <p className="text-2xl font-black text-slate-900">··</p>
                      <p className="text-[11px] font-bold text-slate-500 hyphens-none leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setUpgradeFeature("analytics")}
                  className="mt-4 rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-6 py-2.5 text-sm font-bold"
                >
                  Unlock analytics with Pro
                </button>
                <p className="text-xs text-slate-500 mt-2 hyphens-none">Views, QR scans, calls, WhatsApp, payments and bookings.</p>
              </div>
            ) : counts ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {EVENT_LABELS.map(([k, label]) => (
                  <div key={k} className="text-center">
                    <p className="text-2xl font-black text-slate-900">{counts[k] || 0}</p>
                    <p className="text-[11px] font-bold text-slate-500 hyphens-none leading-tight">{label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{published ? "Loading…" : "Analytics start once your card is published."}</p>
            )}
          </div>

          {/* account */}
          <div className={panel}>
            <h2 className="text-xl font-black tracking-tight text-slate-900 mb-4">Account</h2>
            <p className="text-sm text-slate-600 text-left hyphens-none mb-2">
              {profile.phone ? <>Signed in as <b className="text-slate-900">{profile.phone}</b> · verified on WhatsApp.</> : "Signed in with Google."}
            </p>
            <p className="text-sm text-slate-600 text-left hyphens-none mb-4">
              Plan: <b className="text-slate-900">{pro ? "VakilCard Pro" : "Free"}</b>
              {pro && ent && ent.expires_at ? <> · renews {new Date(ent.expires_at).toLocaleDateString("en-IN")}</> : null}
              {pro && ent && ent.founder_pricing ? <> · Founder price locked (₹{ent.pricing ? ent.pricing.founder_inr : 199}/yr)</> : null}
              {!pro && <> · <button className="text-[#635BFF] font-bold" onClick={() => setUpgradeFeature("pro")}>Upgrade</button></>}
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={doLogout} className={btn}><LogOut className="h-4 w-4" />Sign out</button>
              <button onClick={remove} className="rounded-full bg-white border border-rose-200 hover:border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 inline-flex items-center gap-1.5"><Trash2 className="h-4 w-4" />Delete card</button>
            </div>

            {/* Add-phone nudge — only for Google-only accounts. Optional,
                skippable, unlocks WhatsApp booking alerts once added. */}
            {!profile.phone && (
              <div className="mt-5 pt-5 border-t border-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-slate-900">Add your phone number</h3>
                  {!phoneOpen && (
                    <button type="button" onClick={() => { setPhoneOpen(true); setPhoneErr(""); }} className="text-sm font-bold text-[#635BFF]">
                      Add number
                    </button>
                  )}
                </div>
                {!phoneOpen && (
                  <p className="text-xs text-slate-500 mt-1 text-left hyphens-none">
                    Optional — get a WhatsApp alert whenever someone books an appointment with you.
                  </p>
                )}
                {phoneOpen && (
                  <div className="mt-3 space-y-3 max-w-sm">
                    {phoneStep === "enter" ? (
                      <>
                        <input
                          type="tel"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          placeholder="+91 98765 43210"
                          className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#635BFF] focus:outline-none focus:ring-2 focus:ring-[#635BFF]/20"
                          autoFocus
                        />
                        {phoneErr && <p className="text-sm font-semibold text-rose-700">{phoneErr}</p>}
                        <div className="flex gap-2">
                          <button onClick={sendPhoneCode} disabled={phoneBusy} className="rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-5 py-2.5 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {phoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                            Send code
                          </button>
                          <button type="button" onClick={() => setPhoneOpen(false)} className="rounded-full bg-white border border-slate-200 hover:border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700">Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 hyphens-none">Enter the 6-digit code sent to {phoneInput} on WhatsApp.</p>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={phoneCode}
                          onChange={(e) => setPhoneCode(e.target.value)}
                          placeholder="123456"
                          className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm tracking-widest focus:border-[#635BFF] focus:outline-none focus:ring-2 focus:ring-[#635BFF]/20"
                          autoFocus
                        />
                        {phoneErr && <p className="text-sm font-semibold text-rose-700">{phoneErr}</p>}
                        <div className="flex gap-2">
                          <button onClick={verifyPhoneCode} disabled={phoneBusy} className="rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-5 py-2.5 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {phoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Verify
                          </button>
                          <button type="button" onClick={() => { setPhoneOpen(false); setPhoneStep("enter"); }} className="rounded-full bg-white border border-slate-200 hover:border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700">Cancel</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* password — phone stays primary identity; password is the
                free, instant login credential (OTP costs money per send) */}
            {profile.phone && hasPassword !== null && (
              <div className="mt-5 pt-5 border-t border-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-slate-900">Password</h3>
                  {!pwOpen && (
                    <button
                      type="button"
                      onClick={() => { setPwOpen(true); setPwErr(""); setPwDone(false); }}
                      className="text-sm font-bold text-[#635BFF]"
                    >
                      {hasPassword ? "Change password" : "Set a password"}
                    </button>
                  )}
                </div>
                {!pwOpen && (
                  <p className="text-xs text-slate-500 mt-1 text-left hyphens-none">
                    {hasPassword
                      ? "Sign in instantly with your phone number and password."
                      : "Add a password to skip WhatsApp codes next time you sign in."}
                  </p>
                )}
                {pwOpen && (
                  <div className="mt-3 space-y-3 max-w-sm">
                    {hasPassword && (
                      <PasswordInput
                        value={curPw}
                        onChange={setCurPw}
                        placeholder="Current password"
                        autoComplete="current-password"
                        autoFocus
                        ariaLabel="Current password"
                      />
                    )}
                    <div>
                      <PasswordInput
                        value={newPw1}
                        onChange={setNewPw1}
                        placeholder="New password"
                        autoComplete="new-password"
                        autoFocus={!hasPassword}
                        ariaLabel="New password"
                      />
                      <StrengthBar password={newPw1} />
                    </div>
                    <PasswordInput
                      value={newPw2}
                      onChange={setNewPw2}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                      ariaLabel="Confirm new password"
                      onEnter={submitChangePassword}
                    />
                    {pwErr && <p className="text-sm font-semibold text-rose-700">{pwErr}</p>}
                    {pwDone && <p className="text-sm font-semibold text-emerald-700">Password updated.</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={submitChangePassword}
                        disabled={pwSaving}
                        className="rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-5 py-2.5 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPwOpen(false); setCurPw(""); setNewPw1(""); setNewPw2(""); setPwErr(""); }}
                        className="rounded-full bg-white border border-slate-200 hover:border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          </div>

          {/* edit sections — each opens directly, never replays onboarding */}
          <div className={panel}>
            <h2 className="text-xl font-black tracking-tight text-slate-900 mb-4">Edit your card</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {EDIT_SECTIONS.map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => navigate(`/setup?s=${key}&from=dashboard`)}
                  className="rounded-2xl bg-white border border-slate-200 hover:border-[#635BFF]/50 hover:shadow-sm transition-all px-4 py-3 text-left flex items-center gap-3"
                >
                  <span className="h-9 w-9 rounded-xl bg-[#635BFF]/10 flex items-center justify-center flex-none"><Icon className="h-4 w-4 text-[#635BFF]" /></span>
                  <p className="text-sm font-bold text-slate-800 hyphens-none">{label}</p>
                </button>
              ))}
              <button
                onClick={() => navigate("/setup")}
                className="rounded-2xl bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-4 py-3 text-left flex items-center gap-3"
              >
                <span className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center flex-none"><Pencil className="h-4 w-4" /></span>
                <p className="text-sm font-bold hyphens-none">Guided walkthrough</p>
              </button>
            </div>
          </div>

          {/* Pro tools — every capability visible Free or Pro; locked rows
              open the one UpgradeSheet, never hidden, never a dead tap. */}
          <div className={panel}>
            <h2 className="text-xl font-black tracking-tight text-slate-900 mb-4">Pro tools</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {PRO_TOOLS.map((tool) => (
                <ProToolRow key={tool.key} tool={tool} pro={pro} onLocked={setUpgradeFeature} />
              ))}
            </div>
          </div>

          {/* Booking & Reviews — Free gets real windows-based booking today;
              Pro-only rows (calendar sync, review link) render locked. */}
          <BookingPanel
            pro={pro}
            initialReviewLink={profile.google_review_link || ""}
            initialBusinessUrl={profile.google_business_url || ""}
            onUpgrade={(featureKey) => setUpgradeFeature(featureKey || "booking")}
            onSaveReviewLink={async (link) => {
              await saveFull({ google_review_link: link });
              await load();
            }}
            onSaveBusinessUrl={async (link) => {
              await saveFull({ google_business_url: link });
              await load();
            }}
          />

          {/* share + theme side-by-side on xl — compact tiles, halves page scroll */}
          <div className="grid gap-4 xl:grid-cols-2">
          <div className={panelSm}>
            <h2 className="text-base font-black tracking-tight text-slate-900 mb-2.5">Share</h2>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={copy} className={btnSm}>{copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy link"}</button>
              <button onClick={share} className={btnSm}><Share2 className="h-3.5 w-3.5" />Share</button>
              {qrUrl && (
                <a href={qrUrl} download={`${profile.username}-vakilcard-qr.gif`} onClick={() => track("qr_download", profile.id)} className={btnSm + " no-underline"}>
                  <Download className="h-3.5 w-3.5" />QR
                </a>
              )}
              <button onClick={() => setShowA2HS((s) => !s)} className={btnSm}><Smartphone className="h-3.5 w-3.5" />Add to Home Screen</button>
            </div>
            {showA2HS && (
              <div className="mt-3 text-xs text-slate-600 space-y-2 text-left hyphens-none">
                {installPrompt && (
                  <button onClick={doInstall} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3 py-2 flex items-center justify-center gap-2 transition-colors text-xs">
                    <Smartphone className="h-3.5 w-3.5" /> Add to Home Screen — one tap
                  </button>
                )}
                <p><b className="text-slate-900">iPhone:</b> Safari → Share → "Add to Home Screen".</p>
                {!installPrompt && <p><b className="text-slate-900">Android:</b> Chrome → ⋮ menu → "Add to Home screen".</p>}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-2.5 text-left hyphens-none">
              Print the QR on your letterhead or chamber board — anyone who scans it lands on your card.
            </p>
          </div>

          {/* theme */}
          <div className={panelSm}>
            <h2 className="text-base font-black tracking-tight text-slate-900 mb-2.5">Theme</h2>
            <div className="flex flex-wrap gap-1.5">
              {["system", "dark", "light"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  disabled={savingTheme}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold border transition-colors capitalize ${
                    theme === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {t === "system" ? "Match device" : t}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2 text-left hyphens-none">How your public card appears to clients.</p>

            {/* premium card themes — Pro, real (default/midnight/ivory) */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-black text-slate-900">Card theme</p>
                {!pro && <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Pro</span>}
              </div>
              {!pro ? (
                <button type="button" onClick={() => setUpgradeFeature("premium_themes")} className="w-full rounded-xl border border-slate-200 bg-white hover:border-[#635BFF]/50 transition-colors p-3 text-left">
                  <p className="text-[11px] text-slate-500 hyphens-none">Exclusive card looks for your public VakilCard.</p>
                </button>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {["default", "midnight", "ivory"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setCardTheme(t)}
                      disabled={savingCardTheme}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold border transition-colors capitalize ${
                        (profile.card_theme || "default") === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* branding — Pro, real toggle (defaults to hidden-for-Pro
                unless the owner explicitly overrides it) */}
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-900">Vakilpedia branding</p>
                {!pro && <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Pro</span>}
              </div>
              {!pro ? (
                <button type="button" onClick={() => setUpgradeFeature("remove_branding")} className="text-sm font-bold text-[#635BFF] mt-1">Upgrade to remove it →</button>
              ) : (
                <button
                  type="button"
                  onClick={() => setHideBranding(!(profile.hide_branding !== false))}
                  disabled={savingBranding}
                  className={`mt-2 rounded-full px-4 py-2 text-sm font-bold border transition-colors ${
                    profile.hide_branding !== false ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
                  }`}
                >
                  {profile.hide_branding !== false ? "Branding removed" : "Show branding"}
                </button>
              )}
            </div>
          </div>

          </div>

          {/* ecosystem — inline here below xl (the third column takes over on xl) */}
          <div className="xl:hidden"><EcosystemRail compactGrid /></div>
        </div>

        {/* live card — always in sight while managing */}
        <div className="hidden lg:block sticky top-8 mt-6 lg:mt-0">
          <LiveCardPreview form={form} theme={theme === "light" ? "light" : "dark"} />
        </div>

        {/* third column: the Vakilpedia ecosystem, product discovery */}
        <div className="hidden xl:block sticky top-8">
          <EcosystemRail />
        </div>
      </div>

      {/* the ONE upgrade surface — every locked tap lands here */}
      <UpgradeSheet
        open={!!upgradeFeature}
        feature={upgradeFeature === "pro" ? null : upgradeFeature}
        onClose={() => setUpgradeFeature(null)}
        onUpgraded={() => { setUpgradeFeature(null); load(); }}
      />
    </>
  );
}
