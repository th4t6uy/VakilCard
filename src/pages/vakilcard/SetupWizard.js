// VakilCard guided editing (/vakilcard/setup).
// Not a form wizard — a guided editing mode of the actual product: the REAL
// Design System card renders beside every step (LiveCardPreview) and updates
// on each keystroke. One source of truth end-to-end: state loads from
// GET /me, autosaves via POST /me on every advance, publish flips
// is_published.
//
// Two modes:
//   • Full onboarding (default): all steps, progress, draft resume.
//   • Single-section edit (?s=<section>&from=dashboard): the dashboard deep
//     links straight into one section; Save returns to the dashboard —
//     returning users never replay onboarding.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Eye, Loader2, Rocket, Trash2, User, X } from "lucide-react";
import { getMe, saveProfile, checkUsername, changeUsername, track, ApiError } from "../../lib/vakilcardApi";
import { uploadOptimized, removeUpload } from "../../lib/vakilcardImage";
import {
  normalizeWebsite, isValidWebsite, isValidUpi, isValidIndianMobile,
  normalizeSocial, publishBlockers, chamberNameError, CHAMBER_NAME_MAX,
  chamberTypeError, CHAMBER_TYPE_MAX,
} from "../../lib/vakilcardNormalize";
import { qaActive, qaPreviewSrc, QaBadge } from "../../lib/vakilcardQa";
import QaStepJumper from "../../components/QaStepJumper";
import LiveCardPreview from "../../components/LiveCardPreview";
import UpgradeSheet from "../../components/UpgradeSheet";

const PRACTICE_AREAS = [
  "Civil", "Criminal", "Property", "Corporate", "Family", "Taxation",
  "Consumer", "Arbitration", "Constitutional", "Labour", "Banking",
  "Intellectual Property", "Cyber", "Immigration", "Insurance",
];
const LANGUAGES = ["English", "Hindi", "Punjabi", "Urdu", "Bengali", "Tamil", "Telugu", "Marathi", "Gujarati", "Kannada", "Malayalam", "Odia"];
const SOCIALS = [
  ["linkedin", "LinkedIn", "Profile URL or username"],
  ["facebook", "Facebook", "Page/profile URL or username"],
  ["instagram", "Instagram", "@handle or URL"],
  ["x", "X (Twitter)", "@handle or URL"],
  ["threads", "Threads", "@handle or URL"],
  ["youtube", "YouTube", "@handle or URL"],
  ["whatsapp", "WhatsApp", "Number or wa.me link"],
  ["barcouncil", "Bar Association profile", "Full profile URL"],
];
const EXPERIENCE_OPTIONS = [["0–2 yrs", 1], ["3–5 yrs", 4], ["6–10 yrs", 8], ["11–20 yrs", 15], ["20+ yrs", 25]];
const TIMING_OPTIONS = ["Mon–Sat, 10:00 – 18:00", "Mon–Fri, 10:00 – 17:00", "Mon–Sat, 09:00 – 20:00"];
const DESIGNATION_OPTIONS = ["Advocate", "Senior Advocate", "Advocate-on-Record", "Legal Consultant"];

/* ---------------- consistent control system ---------------- */
// One spacing scale everywhere: cards p-6/sm:p-8, fields space-y-5, chip
// gaps gap-2, section titles mb-1 + description below.

const inputCls =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:border-[#635BFF] focus:outline-none focus:ring-2 focus:ring-[#635BFF]/20 transition-colors";
const inputErrCls =
  "w-full rounded-2xl border border-rose-300 bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200 transition-colors";

const Field = ({ label, hint, error, children }) => (
  <label className="block">
    <span className="text-sm font-bold text-slate-700">{label}</span>
    {hint && <span className="block text-xs text-slate-500 mt-0.5 text-left hyphens-none">{hint}</span>}
    <div className="mt-1.5">{children}</div>
    {error && <span className="block text-xs font-semibold text-rose-700 mt-1.5 text-left hyphens-none">{error}</span>}
  </label>
);

const Chip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors border ${
      active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
    }`}
  >
    {children}
  </button>
);

const Toggle = ({ checked, onChange, children }) => (
  <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#635BFF] h-4 w-4" />
    {children}
  </label>
);

const StepHeader = ({ title, desc }) => (
  <div>
    <h1 className="text-2xl font-black tracking-tight text-slate-900 mb-1">{title}</h1>
    {desc && <p className="text-sm text-slate-600 text-left hyphens-none">{desc}</p>}
  </div>
);

const EMPTY = {
  username: "", full_name: "", designation: "", enrollment_number: "",
  years_of_practice: "", languages: [], bio: "", photo_url: "",
  email: "", phone: "", whatsapp: "", website: "",
  show_email: true, show_phone: true,
  practice_areas: [],
  office: { chamber_name: "", chamber_type: "", address: "", maps_url: "", timings: "" },
  payment: { upi_id: "", upi_qr_url: "", consultation_fee: "", show_upi: true },
  social_links: {},
  // Phase 5 fields — not yet editable from the wizard itself (set from the
  // dashboard's Booking & Reviews / Theme panels), but MUST round-trip
  // through every save (me.js rebuilds the whole row from the body) or a
  // save from any step that doesn't know about them would silently wipe a
  // Pro owner's theme / branding choice / booking windows.
  //
  // google_review_link is GONE (2026-08-29). It was an OAuth-only field, and
  // the Google Business OAuth flow that wrote it was removed with the
  // business.manage scope, so nothing could ever populate it again. me.js
  // never read it off this body anyway. The card's Reviews tile now has one
  // destination for everybody, the office Maps listing.
  google_business_url: "", card_theme: "default", hide_branding: null, booking_windows: [],
};

export function profileToForm(p) {
  if (!p) return null;
  const office = (p.vakilcard_offices || [])[0] || {};
  const payRaw = p.vakilcard_payment_prefs;
  const pay = (Array.isArray(payRaw) ? payRaw[0] : payRaw) || {};
  return {
    ...EMPTY,
    username: p.username || "", full_name: p.full_name === "Advocate" ? "" : p.full_name || "",
    designation: p.designation || "", enrollment_number: p.enrollment_number || "",
    years_of_practice: p.years_of_practice ?? "", languages: p.languages || [],
    bio: p.bio || "", photo_url: p.photo_url || "", email: p.email || "",
    phone: p.phone || "", whatsapp: p.whatsapp || "", website: p.website || "",
    show_email: p.show_email !== false, show_phone: p.show_phone !== false,
    practice_areas: (p.vakilcard_practice_areas || []).sort((a, b) => a.position - b.position).map((x) => x.area),
    office: {
      chamber_name: office.chamber_name || "", chamber_type: office.chamber_type || "",
      address: office.address || "",
      maps_url: office.maps_url || "", timings: office.timings || "",
    },
    payment: {
      upi_id: pay.upi_id || "", upi_qr_url: pay.upi_qr_url || "",
      consultation_fee: pay.consultation_fee ?? "", show_upi: pay.show_upi !== false,
    },
    social_links: p.social_links || {},
    google_business_url: p.google_business_url || "",
    card_theme: p.card_theme || "default",
    hide_branding: typeof p.hide_branding === "boolean" ? p.hide_branding : null,
    booking_windows: Array.isArray(p.booking_windows) ? p.booking_windows : [],
  };
}

/** Card completion %, shared with the dashboard. */
export function completionPct(f) {
  if (!f) return 0;
  const checks = [
    !!f.photo_url, !!f.full_name, !!f.designation, !!f.bio,
    f.practice_areas.length > 0, f.languages.length > 0,
    !!f.phone, !!f.email, !!f.office.address, !!f.office.timings,
    !!f.payment.upi_id, Object.keys(f.social_links).length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// Two-phase onboarding:
//   Phase 1 = step 0 ("Quick setup"): name, phone, photo, UPI + QR — a card
//   that can go live in ~10 seconds via the always-visible Done button.
//   Phase 2 = everything after, entered ONLY via "Add More Information".
const STEPS = ["Quick setup", "Details", "Practice", "Contact", "Office", "Payment", "Presence", "Preview", "Publish"];
export const SECTIONS = { photo: 0, details: 1, practice: 2, contact: 3, office: 4, payment: 5, presence: 6 };

/** First step whose data is still empty — the draft-resume fallback. */
function firstIncompleteStep(f) {
  if (!f.photo_url) return 0;
  if (!f.full_name || !f.designation) return 1;
  if (!f.practice_areas.length) return 2;
  if (!f.phone && !f.email) return 3;
  if (!f.office.address) return 4;
  if (!f.payment.upi_id) return 5;
  if (!Object.keys(f.social_links).length) return 6;
  return 7;
}

const stepKey = (id) => `vc_setup_step_${id || "anon"}`;

export default function SetupWizard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sectionParam = params.get("s");
  const sectionMode = sectionParam != null && SECTIONS[sectionParam] != null;
  const sectionStep = sectionMode ? SECTIONS[sectionParam] : null;

  const [f, setF] = useState(null);
  const [previewToken, setPreviewToken] = useState(null);
  const [ent, setEnt] = useState(null); // entitlements from GET /me
  const [upgradeFeature, setUpgradeFeature] = useState(null);
  const [published, setPublished] = useState(false);
  const [step, setStep] = useState(sectionMode ? sectionStep : 0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadError, setLoadError] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  // Unsaved-changes reminder: true from the moment a field is edited until
  // the next successful autosave (persist()) — covers the real gap where a
  // user edits a field mid-step and closes the tab before hitting "Next"
  // (the only thing that autosaves within a step).
  const [dirty, setDirty] = useState(false);
  const milestones = useRef(new Set());
  const profileId = useRef(null);
  // Username editing lives inside the wizard (Details step) — one edit area.
  const originalUsername = useRef("");
  const [unameStatus, setUnameStatus] = useState("ok"); // ok|checking|taken|reserved|invalid
  const unameTimer = useRef();

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const r = await getMe();
      if (!r.profile) return navigate("/");
      profileId.current = r.profile.id;
      originalUsername.current = r.profile.username || "";
      setPublished(r.profile.is_published === true);
      setPreviewToken(r.preview_token);
      setEnt(r.entitlements || null);
      const form = profileToForm(r.profile);
      setF(form);
      // Draft resume (full mode): exact step from this device, else the
      // first step whose data is still missing.
      if (!sectionMode) {
        let saved = null;
        try { saved = parseInt(localStorage.getItem(stepKey(r.profile.id)), 10); } catch {}
        setStep(Number.isInteger(saved) && saved >= 0 && saved < STEPS.length ? saved : firstIncompleteStep(form));
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return navigate("/");
      setLoadError(true);
    }
  }, [navigate, sectionMode]);

  useEffect(() => {
    document.title = "Set up your VakilCard | Vakilpedia";
    load();
  }, [load]);

  // Persist the exact position — resume is never approximate.
  useEffect(() => {
    if (sectionMode || !profileId.current) return;
    try { localStorage.setItem(stepKey(profileId.current), String(step)); } catch {}
  }, [step, sectionMode]);

  const set = (k, v) => { setF((s) => ({ ...s, [k]: v })); setDirty(true); };
  const setNested = (g, k, v) => { setF((s) => ({ ...s, [g]: { ...s[g], [k]: v } })); setDirty(true); };
  const setFieldError = (k, msg) => setFieldErrors((e) => ({ ...e, [k]: msg || undefined }));

  const persist = async (extra = {}) => {
    const body = { ...f, full_name: f.full_name || "Advocate", ...extra };
    const r = await saveProfile(body);
    const pct = completionPct(f);
    for (const m of [25, 50, 75]) {
      if (pct >= m && !milestones.current.has(m)) {
        milestones.current.add(m);
        track(`profile_${m}`, profileId.current);
      }
    }
    setDirty(false);
    return r;
  };

  const onUsernameInput = (value) => {
    clearTimeout(unameTimer.current);
    const u = value.toLowerCase().trim();
    set("username", value);
    if (u === originalUsername.current) return setUnameStatus("ok");
    if (!/^(?=.{3,30}$)[a-z0-9]+([._-][a-z0-9]+)*$/.test(u) || /^[0-9]+$/.test(u))
      return setUnameStatus("invalid");
    setUnameStatus("checking");
    unameTimer.current = setTimeout(async () => {
      try {
        const r = await checkUsername(u);
        setUnameStatus(r.available ? "ok" : r.reason);
      } catch {
        setUnameStatus("ok"); // don't block editing on a network blip
      }
    }, 400);
  };

  /* -------- normalize-on-blur: accept anything, store the canonical form -------- */

  const blurWebsite = () => {
    if (!f.website) return setFieldError("website", "");
    const n = normalizeWebsite(f.website);
    set("website", n);
    setFieldError("website", isValidWebsite(n) ? "" : "That doesn't look like a valid link — it won't be shown on your card until fixed.");
  };
  const blurUpi = () => {
    setFieldError("upi", isValidUpi(f.payment.upi_id) ? "" : "UPI ID should look like name@bank.");
  };
  const blurPhone = (k) => {
    setFieldError(k, !f[k] || isValidIndianMobile(f[k]) ? "" : "Doesn't look like a valid Indian mobile number.");
  };
  const blurSocial = (key) => {
    const raw = f.social_links[key];
    if (!raw) return setFieldError(`social_${key}`, "");
    const n = normalizeSocial(key, raw);
    if (n === null) {
      setFieldError(`social_${key}`, "Not recognizable — paste the profile URL or your @handle.");
    } else {
      set("social_links", { ...f.social_links, [key]: n });
      setFieldError(`social_${key}`, "");
    }
  };

  const saveAndClose = async () => {
    setError("");
    setSaving(true);
    try {
      await persist();
      navigate(f.username ? `/${f.username}/dashboard` : "/");
    } catch {
      setError("Couldn't save. Check your connection and try again.");
      setSaving(false);
    }
  };

  const saveNow = async () => {
    setError("");
    setSaving(true);
    try {
      await persist();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    setError("");
    setSaving(true);
    try {
      // Username change (Details step): claim the new link first — the old
      // one becomes a permanent redirect, links never break.
      const uname = (f.username || "").toLowerCase().trim();
      if (uname && uname !== originalUsername.current) {
        if (unameStatus !== "ok") {
          setError("Please pick an available link before continuing.");
          setSaving(false);
          return;
        }
        await changeUsername(uname);
        originalUsername.current = uname;
        set("username", uname);
      }
      await persist(); // autosave draft on every advance
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      window.scrollTo(0, 0);
    } catch (e) {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  // Free plans: website is locked (server strips it) — never block publish
  // on a field the user can't edit.
  const blockers = f
    ? publishBlockers(f).filter((b) => (ent && !ent.pro ? b.field !== "website" : true))
    : [];

  // Phase-1 "Done": publish the essentials and open the dashboard. The rest
  // of the profile stays optional, editable any time from the dashboard.
  const quickDone = async () => {
    setError("");
    if (blockers.length) {
      setError(blockers[0].message);
      return;
    }
    setSaving(true);
    try {
      await persist({ is_published: true });
      track("published", profileId.current);
      track("quick_onboard_done", profileId.current);
      try { localStorage.removeItem(stepKey(profileId.current)); } catch {}
      navigate(f.username ? `/${f.username}/dashboard` : "/");
    } catch {
      setError("Couldn't save. Check your connection and try again.");
      setSaving(false);
    }
  };

  const publish = async () => {
    setError("");
    if (blockers.length) {
      setError("Please fix the items above before publishing.");
      return;
    }
    setSaving(true);
    try {
      await persist({ is_published: true });
      track("published", profileId.current);
      try { localStorage.removeItem(stepKey(profileId.current)); } catch {}
      window.location.href = `/${f.username}`;
    } catch {
      setError("Couldn't publish. Please try again.");
      setSaving(false);
    }
  };

  const upload = async (file, kind) => {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const url = await uploadOptimized(file, kind);
      if (kind === "photo") set("photo_url", url);
      else setNested("payment", "upi_qr_url", url);
    } catch (e) {
      const code = (e && (e.code || e.message)) || "";
      setError(
        code === "too_large" ? "Image is over 5 MB — please pick a smaller one." :
        code === "not_image" ? "That file isn't an image." :
        code === "decode_failed" ? "We couldn't read that image — try a JPG or PNG." :
        code === "encode_failed" ? "We couldn't process that image on this device — try a different photo." :
        code === "unauthenticated" || code === "http_401" ? "Your session expired — please verify your number again." :
        `Upload failed (${code || "network"}). Please try again.`
      );
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (kind) => {
    setError("");
    setUploading(true);
    try {
      await removeUpload(kind); // server deletes the object + clears the URL
      if (kind === "photo") set("photo_url", "");
      else setNested("payment", "upi_qr_url", "");
    } catch {
      setError("Couldn't remove the image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (loadError)
    return (
      <Shell>
        <div className="text-center py-20">
          <p className="text-slate-600">Couldn't load your card.</p>
          <button className="mt-4 rounded-full bg-slate-900 text-white px-6 py-3 font-bold" onClick={load}>Retry</button>
        </div>
      </Shell>
    );
  if (!f)
    return (
      <Shell>
        <div className="space-y-4 py-10 animate-pulse">
          <div className="h-8 bg-white/70 rounded-2xl w-2/3" />
          <div className="h-40 bg-white/70 rounded-[2rem]" />
          <div className="h-12 bg-white/70 rounded-full" />
        </div>
      </Shell>
    );

  // Step-progress percentage derives from the SAME math as the step label —
  // the two indicators can never disagree.
  const stepPct = Math.round(((step + 1) / STEPS.length) * 100);

  const stepBody = (
    <div className="bg-white/70 backdrop-blur-xl border border-slate-200/70 shadow-sm rounded-[2rem] p-6 sm:p-8 space-y-5">
      {step === 0 && sectionMode && (
        <>
          <StepHeader title="Your photo" desc="A clear, professional photo builds instant trust. Square-cropped and optimized automatically." />
          <div className="flex items-center gap-6">
            {f.photo_url ? (
              <img src={f.photo_url} alt="Profile" className="h-28 w-28 rounded-full object-cover border-2 border-[#635BFF]" />
            ) : (
              <div className="h-28 w-28 rounded-full bg-slate-100 flex items-center justify-center"><User className="h-10 w-10 text-slate-400" /></div>
            )}
            <div className="flex flex-col gap-2.5">
              <label className="cursor-pointer rounded-full bg-white border border-slate-200 hover:border-slate-300 px-6 py-3 text-sm font-bold text-slate-700 text-center">
                {uploading ? "Optimizing…" : f.photo_url ? "Change photo" : "Upload photo"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files[0], "photo")} />
              </label>
              {f.photo_url && !uploading && (
                <button type="button" onClick={() => removeImage("photo")} className="text-xs font-bold text-rose-600 inline-flex items-center gap-1 justify-center">
                  <Trash2 className="h-3.5 w-3.5" />Remove
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {step === 0 && !sectionMode && (
        <>
          <StepHeader title="Your card, in 10 seconds" desc="Just the essentials — your card can go live right now. Everything else is optional and editable any time." />
          <div className="flex items-center gap-5">
            {f.photo_url ? (
              <img src={f.photo_url} alt="Profile" className="h-24 w-24 rounded-full object-cover border-2 border-[#635BFF] flex-none" />
            ) : (
              <div className="h-24 w-24 rounded-full bg-slate-100 flex items-center justify-center flex-none"><User className="h-9 w-9 text-slate-400" /></div>
            )}
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer rounded-full bg-white border border-slate-200 hover:border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 text-center">
                {uploading ? "Optimizing…" : f.photo_url ? "Change photo" : "Upload profile photo"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files[0], "photo")} />
              </label>
              {f.photo_url && !uploading && (
                <button type="button" onClick={() => removeImage("photo")} className="text-xs font-bold text-rose-600 inline-flex items-center gap-1 justify-center">
                  <Trash2 className="h-3.5 w-3.5" />Remove
                </button>
              )}
            </div>
          </div>
          <Field label="Your name">
            <input className={inputCls} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Adv. Sidharth Gautam" />
          </Field>
          <Field label="Phone" hint="Pre-filled from your WhatsApp verification." error={fieldErrors.phone}>
            <input className={fieldErrors.phone ? inputErrCls : inputCls} type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} onBlur={() => blurPhone("phone")} />
          </Field>
          <Field label="UPI ID (optional)" hint="Lets clients pay your consultation fee in one tap." error={fieldErrors.upi}>
            <input className={fieldErrors.upi ? inputErrCls : inputCls} autoCapitalize="none" value={f.payment.upi_id} onChange={(e) => setNested("payment", "upi_id", e.target.value)} onBlur={blurUpi} placeholder="name@upi" />
          </Field>
          <Field label="Payment QR (optional)" hint="From your banking or UPI app — stored at scan quality.">
            <div className="flex items-center gap-4">
              {f.payment.upi_qr_url && (
                <div className="flex flex-col items-center gap-1.5">
                  <img src={f.payment.upi_qr_url} alt="UPI QR" className="h-16 w-16 rounded-xl object-contain bg-white border border-slate-200" />
                  <button type="button" onClick={() => removeImage("upiqr")} className="text-xs font-bold text-rose-600 inline-flex items-center gap-1">
                    <Trash2 className="h-3 w-3" />Remove
                  </button>
                </div>
              )}
              <label className="cursor-pointer rounded-full bg-white border border-slate-200 hover:border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700">
                {uploading ? "Optimizing…" : f.payment.upi_qr_url ? "Replace QR" : "Upload payment QR"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files[0], "upiqr")} />
              </label>
            </div>
          </Field>
          {/* Phase-1 actions — Done is ALWAYS visible (sticky on mobile). */}
          <div className="sticky bottom-3 z-10 pt-2 space-y-2.5">
            <button
              className="w-full rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-8 py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg"
              disabled={saving || uploading}
              onClick={quickDone}
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              Done — publish my card
            </button>
            <button
              className="w-full rounded-full bg-white border border-slate-200 hover:border-slate-300 px-8 py-3.5 font-bold text-slate-700 transition-colors flex items-center justify-center gap-2"
              disabled={saving || uploading}
              onClick={next}
            >
              Add More Information <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <StepHeader title="Professional details" />
          {ent && !ent.pro ? (
            // Custom usernames are Pro — the field never dead-ends: tapping
            // it opens the standard upgrade sheet.
            <Field label="Your VakilCard link">
              <button
                type="button"
                onClick={() => setUpgradeFeature("custom_username")}
                className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left"
              >
                <span className="text-sm text-slate-600 break-all">vakilpedia.com/<b className="text-slate-900">{f.username}</b></span>
                <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[10px] font-black uppercase tracking-wider px-2 py-0.5 flex-none ml-3">Custom · Pro</span>
              </button>
            </Field>
          ) : (
            <Field label="Your VakilCard link" hint="Change it anytime — old links redirect forever.">
              <div className="flex items-center">
                <span className="rounded-l-2xl border border-r-0 border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">vakilpedia.com/</span>
                <input className={inputCls + " rounded-l-none"} autoCapitalize="none" autoCorrect="off" value={f.username} onChange={(e) => onUsernameInput(e.target.value)} />
              </div>
              {unameStatus !== "ok" && (
                <p className={`mt-1.5 text-xs font-semibold text-left hyphens-none ${unameStatus === "checking" ? "text-slate-500" : "text-rose-700"}`}>
                  {unameStatus === "checking" ? "Checking availability…" :
                   unameStatus === "taken" ? "Already taken." :
                   unameStatus === "reserved" ? "Reserved — please pick another." :
                   "3–30 chars: letters, numbers, dots, hyphens, underscores. Not only numbers."}
                </p>
              )}
            </Field>
          )}
          <Field label="Full name"><input className={inputCls} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Adv. Sidharth Gautam" /></Field>
          <Field label="Designation" hint="Pick one or write your own.">
            <div className="flex flex-wrap gap-2 mb-2.5">
              {DESIGNATION_OPTIONS.map((d) => (
                <Chip key={d} active={(f.designation || "").startsWith(d)} onClick={() => set("designation", d)}>{d}</Chip>
              ))}
            </div>
            <input className={inputCls} value={f.designation} onChange={(e) => set("designation", e.target.value)} placeholder="Advocate, Punjab & Haryana High Court" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Enrollment number (optional)"><input className={inputCls} value={f.enrollment_number} onChange={(e) => set("enrollment_number", e.target.value)} placeholder="P/1234/2005" /></Field>
            <Field label="Years of practice">
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_OPTIONS.map(([label, years]) => (
                  <Chip key={label} active={Number(f.years_of_practice) === years} onClick={() => set("years_of_practice", years)}>{label}</Chip>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Short bio" hint={`${(f.bio || "").length}/500`}>
            <textarea className={inputCls} rows={3} maxLength={500} value={f.bio} onChange={(e) => set("bio", e.target.value)} />
          </Field>
          <Field label="Languages">
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <Chip key={l} active={f.languages.includes(l)} onClick={() => set("languages", f.languages.includes(l) ? f.languages.filter((x) => x !== l) : [...f.languages, l])}>{l}</Chip>
              ))}
            </div>
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader title="Practice areas" desc="Pick the areas clients should see first — they appear on your card instantly." />
          <div className="flex flex-wrap gap-2">
            {PRACTICE_AREAS.map((a) => (
              <Chip key={a} active={f.practice_areas.includes(a)} onClick={() => set("practice_areas", f.practice_areas.includes(a) ? f.practice_areas.filter((x) => x !== a) : [...f.practice_areas, a])}>{a}</Chip>
            ))}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <StepHeader title="Contact" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Phone" error={fieldErrors.phone}>
              <input className={fieldErrors.phone ? inputErrCls : inputCls} type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} onBlur={() => blurPhone("phone")} />
            </Field>
            <Field label="WhatsApp" hint="Blank = same as phone" error={fieldErrors.whatsapp}>
              <input className={fieldErrors.whatsapp ? inputErrCls : inputCls} type="tel" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} onBlur={() => blurPhone("whatsapp")} />
            </Field>
            <Field label="Email"><input className={inputCls} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
            {ent && !ent.pro ? (
              <Field label="Website">
                <button
                  type="button"
                  onClick={() => setUpgradeFeature("website")}
                  className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left"
                >
                  <span className="text-sm text-slate-500">Show your website on your card</span>
                  <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[10px] font-black uppercase tracking-wider px-2 py-0.5 flex-none ml-3">Pro</span>
                </button>
              </Field>
            ) : (
              <Field label="Website (optional)" hint="We'll add https:// for you." error={fieldErrors.website}>
                <input className={fieldErrors.website ? inputErrCls : inputCls} inputMode="url" autoCapitalize="none" value={f.website} onChange={(e) => set("website", e.target.value)} onBlur={blurWebsite} placeholder="yourchambers.in" />
              </Field>
            )}
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 pt-1">
            <Toggle checked={f.show_phone} onChange={(v) => set("show_phone", v)}>Show phone publicly</Toggle>
            <Toggle checked={f.show_email} onChange={(v) => set("show_email", v)}>Show email publicly</Toggle>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <StepHeader title="Your chamber" />
          <Field label="Chamber name" hint="Any name you like — firm, chamber, or your own name." error={fieldErrors.chamber_name}>
            <input
              className={fieldErrors.chamber_name ? inputErrCls : inputCls}
              maxLength={CHAMBER_NAME_MAX}
              value={f.office.chamber_name}
              onChange={(e) => { setNested("office", "chamber_name", e.target.value); if (fieldErrors.chamber_name) setFieldError("chamber_name", chamberNameError(e.target.value)); }}
              onBlur={(e) => setFieldError("chamber_name", chamberNameError(e.target.value))}
              placeholder="e.g. Sidharth Gautam Law Chambers"
            />
          </Field>
          {/* 2026-08-16: was implicit (any words after the first in Chamber
              name, else a forced "LAW CHAMBERS") — not every practice IS a
              chambers. Now its own optional field; leave blank for no
              caption at all. */}
          <Field label="Firm type" hint="Shown as a small label under your name. Not every practice is a “chambers” — use whatever fits (Associates, Advocates, & Co.), or leave blank for none." error={fieldErrors.chamber_type}>
            <input
              className={fieldErrors.chamber_type ? inputErrCls : inputCls}
              maxLength={CHAMBER_TYPE_MAX}
              value={f.office.chamber_type}
              onChange={(e) => { setNested("office", "chamber_type", e.target.value); if (fieldErrors.chamber_type) setFieldError("chamber_type", chamberTypeError(e.target.value)); }}
              onBlur={(e) => setFieldError("chamber_type", chamberTypeError(e.target.value))}
              placeholder="e.g. Law Chambers, Legal Associates, Advocates"
            />
          </Field>
          <Field label="Office timings" hint="Pick one or write your own.">
            <div className="flex flex-wrap gap-2 mb-2.5">
              {TIMING_OPTIONS.map((t) => (
                <Chip key={t} active={f.office.timings === t} onClick={() => setNested("office", "timings", t)}>{t}</Chip>
              ))}
            </div>
            <input className={inputCls} value={f.office.timings} onChange={(e) => setNested("office", "timings", e.target.value)} placeholder="Mon–Sat, 10:00 – 18:00" />
          </Field>
          <Field label="Address" hint="Powers the map and the Directions button on your card.">
            <textarea className={inputCls} rows={2} value={f.office.address} onChange={(e) => setNested("office", "address", e.target.value)} />
          </Field>
          <Field label="Google Maps link (optional)" hint="Search your chamber on Google Maps, tap Share, and paste the link here — the Directions button will open your exact pin.">
            <div className="flex gap-2">
              <input className={inputCls} value={f.office.maps_url} onChange={(e) => setNested("office", "maps_url", e.target.value)} placeholder="https://maps.app.goo.gl/…" />
              <button
                type="button"
                className="flex-none rounded-2xl bg-white border border-slate-200 hover:border-[#635BFF]/50 px-4 py-3 text-sm font-bold text-slate-700 transition-colors"
                onClick={() => {
                  const q = f.office.chamber_name || f.office.address || f.full_name || "my chamber";
                  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, "_blank", "noopener");
                }}
              >
                Search Maps
              </button>
            </div>
          </Field>
        </>
      )}

      {step === 5 && (
        <>
          <StepHeader title="Payments (optional)" desc="Clients pay you directly over UPI. No money ever passes through Vakilpedia." />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="UPI ID" error={fieldErrors.upi}>
              <input className={fieldErrors.upi ? inputErrCls : inputCls} autoCapitalize="none" value={f.payment.upi_id} onChange={(e) => setNested("payment", "upi_id", e.target.value)} onBlur={blurUpi} placeholder="name@upi" />
            </Field>
            <Field label="Consultation fee (₹, optional)"><input className={inputCls} type="number" min="0" value={f.payment.consultation_fee} onChange={(e) => setNested("payment", "consultation_fee", e.target.value)} placeholder="2000" /></Field>
          </div>
          <Field label="Your UPI QR (optional)" hint="From your banking or UPI app. Stored at scan quality — never over-compressed.">
            <div className="flex items-center gap-5">
              {f.payment.upi_qr_url && (
                <div className="flex flex-col items-center gap-1.5">
                  <img src={f.payment.upi_qr_url} alt="UPI QR" className="h-20 w-20 rounded-xl object-contain bg-white border border-slate-200" />
                  <button type="button" onClick={() => removeImage("upiqr")} className="text-xs font-bold text-rose-600 inline-flex items-center gap-1">
                    <Trash2 className="h-3 w-3" />Remove
                  </button>
                </div>
              )}
              <label className="cursor-pointer rounded-full bg-white border border-slate-200 hover:border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700">
                {uploading ? "Optimizing…" : f.payment.upi_qr_url ? "Replace QR" : "Upload UPI QR"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files[0], "upiqr")} />
              </label>
            </div>
          </Field>
        </>
      )}

      {step === 6 && (
        <>
          <StepHeader title="Professional presence" desc="Paste a URL or just type your @handle — we'll turn it into the right link. Only populated platforms appear on your card." />
          {SOCIALS.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint} error={fieldErrors[`social_${key}`]}>
              <input
                className={fieldErrors[`social_${key}`] ? inputErrCls : inputCls}
                autoCapitalize="none"
                placeholder={hint}
                value={f.social_links[key] || ""}
                onChange={(e) => set("social_links", { ...f.social_links, [key]: e.target.value })}
                onBlur={() => blurSocial(key)}
              />
            </Field>
          ))}
        </>
      )}

      {step === 7 && (
        <>
          <StepHeader title="Preview" desc="This is your real card — exactly what clients will see." />
          {previewToken || qaPreviewSrc() ? (
            <iframe
              key={step} // reload with freshest save
              title="VakilCard preview"
              src={qaPreviewSrc() || `/api/vakilcard/profile?username=${encodeURIComponent(f.username)}&pt=${encodeURIComponent(previewToken)}`}
              className="w-full rounded-[1.5rem] border border-slate-200 bg-white"
              style={{ height: "70vh" }}
            />
          ) : (
            <LiveCardPreview form={f} />
          )}
        </>
      )}

      {step === 8 && (
        <div className="text-center py-4">
          <Rocket className="h-12 w-12 text-[#635BFF] mx-auto" />
          <h1 className="text-2xl font-black tracking-tight text-slate-900 mt-4">{published ? "Publish your updates" : "Ready to go live?"}</h1>
          <p className="text-sm text-slate-600 mt-2 text-center hyphens-none">
            Your card will be live at <b className="text-slate-900">vakilpedia.com/{f.username}</b> — shareable, searchable, yours.
          </p>
          {blockers.length > 0 && (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-left">
              <p className="text-sm font-black text-rose-800 mb-2">Fix these before publishing:</p>
              {blockers.map((b) => (
                <p key={b.field} className="text-sm text-rose-700 text-left hyphens-none">• {b.message}</p>
              ))}
            </div>
          )}
          <button
            className="mt-6 w-full rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-8 py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            disabled={saving || blockers.length > 0}
            onClick={publish}
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {published ? "Publish updates" : "Publish my VakilCard"}
          </button>
        </div>
      )}

      {error && <p className="text-sm font-semibold text-rose-700 text-left hyphens-none">{error}</p>}
    </div>
  );

  /* ---------------- single-section edit (from the dashboard) ---------------- */

  if (sectionMode) {
    return (
      <Shell wide>
        <QaBadge />
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px] lg:gap-8 xl:gap-10 lg:items-start">
          <div>
            <button className="mb-5 text-sm font-bold text-slate-500 inline-flex items-center gap-1.5" onClick={() => navigate(f.username ? `/${f.username}/dashboard` : "/")}>
              <ArrowLeft className="h-4 w-4" />Back to dashboard
            </button>
            {stepBody}
            <button
              className="mt-5 w-full rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-8 py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              disabled={saving}
              onClick={saveAndClose}
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              Save
            </button>
          </div>
          <div className="hidden lg:block sticky top-8">
            <LiveCardPreview form={f} />
          </div>
        </div>
        <MobilePreview form={f} open={showMobilePreview} setOpen={setShowMobilePreview} />
      <UpgradeSheet open={!!upgradeFeature} feature={upgradeFeature} onClose={() => setUpgradeFeature(null)} onUpgraded={() => { setUpgradeFeature(null); load(); }} />
      <UnsavedChangesToast dirty={dirty} saving={saving} onSaveNow={saveNow} />
      </Shell>
    );
  }

  /* ---------------- full guided onboarding ---------------- */

  return (
    <Shell wide>
      <QaBadge />
      {qaActive() && <QaStepJumper steps={STEPS} step={step} onJump={(i) => { setStep(i); window.scrollTo(0, 0); }} />}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px] lg:gap-8 xl:gap-10 lg:items-start">
        <div>
          {/* progress — label and bar share one formula, they can never diverge */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-slate-700">{STEPS[step]} <span className="text-slate-400">· step {step + 1} of {STEPS.length}</span></p>
            <p className="text-sm font-bold text-[#635BFF]">{stepPct}%</p>
          </div>
          <div className="h-1.5 bg-white/70 rounded-full mb-6 overflow-hidden">
            <div className="h-full bg-[#635BFF] rounded-full transition-all duration-500" style={{ width: `${stepPct}%` }} />
          </div>

          {stepBody}

          {/* nav — step 0 (Quick setup) carries its own Done / Add More
              actions, so the standard stepper controls start at step 1 */}
          {step > 0 && (
            <div className="flex items-center justify-between mt-5">
              <button
                className="rounded-full bg-white border border-slate-200 hover:border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 inline-flex items-center gap-1.5 disabled:opacity-40"
                disabled={saving}
                onClick={() => setStep((s) => s - 1)}
              >
                <ArrowLeft className="h-4 w-4" />Back
              </button>
              {step < STEPS.length - 1 && (
                <button
                  className="rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-7 py-3 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                  disabled={saving}
                  onClick={next}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <button className="w-full text-center text-sm font-bold text-slate-500 mt-4" onClick={saveAndClose}>
            Save & finish later
          </button>
        </div>

        {/* desktop: the card comes alive beside the steps */}
        <div className="hidden lg:block sticky top-8">
          <LiveCardPreview form={f} />
        </div>
      </div>
      <MobilePreview form={f} open={showMobilePreview} setOpen={setShowMobilePreview} />
      <UpgradeSheet open={!!upgradeFeature} feature={upgradeFeature} onClose={() => setUpgradeFeature(null)} onUpgraded={() => { setUpgradeFeature(null); load(); }} />
      <UnsavedChangesToast dirty={dirty} saving={saving} onSaveNow={saveNow} />
    </Shell>
  );
}

/** Persistent side toast — reminds the owner they have edits that haven't
 * been saved yet (a field was typed into since the last successful
 * autosave). Bottom-right on desktop, above-the-fold-safe on mobile; never
 * blocks any control underneath. Clicking "Save now" calls the same
 * persist() autosave the step-advance buttons use, without navigating away
 * or advancing the step. */
function UnsavedChangesToast({ dirty, saving, onSaveNow }) {
  if (!dirty) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[300] bottom-5 right-5 max-w-[calc(100vw-2.5rem)] sm:max-w-xs rounded-2xl border border-amber-200 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.18)] px-4 py-3.5 flex items-center gap-3"
    >
      <span className="flex-shrink-0 h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">Unsaved changes</p>
        <p className="text-xs text-slate-500 mt-0.5">These edits aren't saved yet.</p>
      </div>
      <button
        className="flex-shrink-0 rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-3.5 py-2 text-xs font-bold disabled:opacity-50"
        disabled={saving}
        onClick={onSaveNow}
      >
        {saving ? "Saving…" : "Save now"}
      </button>
    </div>
  );
}

/** Mobile: floating "See my card" chip → fullscreen live preview overlay. */
function MobilePreview({ form, open, setOpen }) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-5 right-4 z-40 rounded-full bg-slate-900 text-white text-sm font-bold px-5 py-3 shadow-xl inline-flex items-center gap-2"
      >
        <Eye className="h-4 w-4" />See my card
      </button>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="fixed top-4 right-4 z-[60] rounded-full bg-slate-900/85 backdrop-blur text-white text-sm font-bold px-4 py-2.5 inline-flex items-center gap-1.5 shadow-lg"
          >
            <X className="h-4 w-4" />Close
          </button>
          <div className="max-w-md mx-auto px-4 py-14">
            <LiveCardPreview form={form} />
          </div>
        </div>
      )}
    </>
  );
}

function Shell({ children, wide = false }) {
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(120deg, rgba(205,239,251,.35), rgba(253,238,203,.35)), #fff" }}>
      <div className={wide ? "vp-container py-8 sm:py-12" : "max-w-xl mx-auto px-4 py-8 sm:py-12"}>{children}</div>
    </div>
  );
}
