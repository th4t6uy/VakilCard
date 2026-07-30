// VakilCard — THE single public entry point (/vakilcard).
//   Signed out → the product landing + WhatsApp OTP (SignupPage), which
//                routes new users into onboarding and existing owners here.
//   Signed in  → Owner Dashboard: live card preview + direct section editing
//                (deep links into /vakilcard/setup?s=…&from=dashboard — a
//                returning owner never replays onboarding), QR, theme,
//                share, publish, analytics, account.
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import {
  ArrowRight, Banknote, Briefcase, Check, Copy, Download, ExternalLink, Eye,
  Globe2, Image as ImageIcon, Landmark, Loader2, Lock, LogOut, Phone, Pencil,
  QrCode, Rocket, Share2, Smartphone, Trash2, UserRound,
} from "lucide-react";
import {
  getMe, getMyAnalytics, getAccount, saveProfile, deleteProfile,
  logout as apiLogout, changePassword as apiChangePassword,
  hasPhoneSession, track, ApiError,
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

const EVENT_LABELS = [
  ["view", "Views"], ["share", "Shares"], ["call", "Calls"],
  ["whatsapp", "WhatsApp"], ["pay", "Payments started"], ["directions", "Directions"],
  ["save_contact", "Contacts saved"], ["qr_download", "QR scans/downloads"],
];

// Vakilpedia ecosystem cross-promotion (dashboard right rail). VakilCard is
// free-forever by design — it's the top of the Vakilpedia funnel. This rail
// is the sales surface: real product art (the same icons used on the
// marketing homepage), not text links, so it reads as "a Vakilpedia
// product" rather than a bolted-on directory. CaseLinx is the featured
// upsell (matches Home.js's hero-card treatment, just compact).
const CASELINX = {
  name: "CaseLinx", tag: "the Litigation OS.", badge: "Beta Open",
  desc: "Case diary, cause lists, billing and e-signing — everything your VakilCard clients need you to run in the background.",
  href: "/caselinx", icon: "/caselinx_icon_v2.png", cta: "Explore CaseLinx",
};
const ECOSYSTEM = [
  ["IPC / BNS Converter", "Old-to-new criminal law sections, instantly.", "/ipc-to-bns-converter", null, "/ipc_bns_converter_icon.png"],
  ["EvidenceHash", "SHA-256 hashing for digital evidence.", "/evidence-hash-sha256", null, "/evidencehash_icon.png"],
  ["Vakilnama", "The Vakilpedia publication for lawyers.", "/vakilnama", null, "/Vakilnama_cover.png"],
  ["CourtQue", "Display-board alerts on WhatsApp.", "/courtque", "New", "/courtque_icon_v3.png"],
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

export default function VakilCardPage() {
  const navigate = useNavigate();
  const { username: routeUsername } = useParams(); // set on /vakilcard/:username/dashboard
  const [fbUser, setFbUser] = useState(undefined);
  const [profile, setProfile] = useState(undefined); // undefined=loading, null=none
  const [counts, setCounts] = useState(null);
  const [signingIn, setSigningIn] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showA2HS, setShowA2HS] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null); // Android beforeinstallprompt
  const [publishing, setPublishing] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [ent, setEnt] = useState(null); // entitlements from GET /me
  const [upgradeFeature, setUpgradeFeature] = useState(null); // null | feature key

  // Change Password (Account panel) — hasPassword null until we know;
  // account.js reports it via has_password so the UI can say "Set a
  // password" (no current one yet) vs "Change password".
  const [hasPassword, setHasPassword] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw1, setNewPw1] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwDone, setPwDone] = useState(false);

  const authed = hasPhoneSession() || fbUser;

  useEffect(() => {
    document.title = "VakilCard — One Link. Everything Your Client Needs. | Vakilpedia";
    return onAuthStateChanged(auth, (u) => setFbUser(u || null));
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
    if (fbUser === undefined) return;
    if (authed) load();
    else setProfile(null);
  }, [fbUser, authed, load]);

  useEffect(() => {
    if (!authed) return;
    getAccount().then((a) => setHasPassword(!!a.has_password)).catch(() => {});
  }, [authed]);

  // Keep the dashboard URL canonical: /vakilcard/:username/dashboard. Runs once
  // the signed-in owner's profile is known.
  //  • /vakilcard (no username) → the owner's dashboard URL
  //  • a stale/mismatched username in the URL → the owner's own dashboard
  // Deep links and refreshes keep working: auth is re-established on load and
  // this effect re-runs with the resolved profile.
  useEffect(() => {
    if (!authed || !profile || !profile.username) return;
    if (routeUsername !== profile.username) {
      navigate(`/vakilcard/${profile.username}/dashboard`, { replace: true });
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

  const signInGoogle = async () => {
    setSigningIn(true);
    try { await signInWithPopup(auth, googleProvider); } catch {} finally { setSigningIn(false); }
  };

  const doLogout = async () => {
    await apiLogout();
    if (auth.currentUser) await signOut(auth);
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
  if (fbUser !== undefined && !authed) {
    return (
      <>
        <SEOHead 
          title="VakilCard | Free Digital Business Card for Indian Advocates"
          description="Create your free digital chamber card. Share office location, directions, contact info, practice areas, and receive UPI payments instantly."
          keywords="VakilCard, digital business card lawyers India, chamber card advocates, digital profile advocates, UPI payments lawyers"
          canonicalUrl="https://www.vakilpedia.com/vakilcard"
          imageUrl="https://www.vakilpedia.com/logo.png"
        />
        <SignupPage onGoogleSignIn={signInGoogle} googleSigningIn={signingIn} />
      </>
    );
  }

  // Loading / error
  if (fbUser === undefined || profile === undefined) {
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

  // Authed but no card yet (e.g. Google sign-in without a profile)
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
        canonicalUrl="https://www.vakilpedia.com/vakilcard"
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

          {/* edit sections — each opens directly, never replays onboarding */}
          <div className={panel}>
            <h2 className="text-xl font-black tracking-tight text-slate-900 mb-4">Edit your card</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {EDIT_SECTIONS.map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => navigate(`/vakilcard/setup?s=${key}&from=dashboard`)}
                  className="rounded-2xl bg-white border border-slate-200 hover:border-[#635BFF]/50 hover:shadow-sm transition-all px-4 py-3 text-left flex items-center gap-3"
                >
                  <span className="h-9 w-9 rounded-xl bg-[#635BFF]/10 flex items-center justify-center flex-none"><Icon className="h-4 w-4 text-[#635BFF]" /></span>
                  <p className="text-sm font-bold text-slate-800 hyphens-none">{label}</p>
                </button>
              ))}
              <button
                onClick={() => navigate("/vakilcard/setup")}
                className="rounded-2xl bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-4 py-3 text-left flex items-center gap-3"
              >
                <span className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center flex-none"><Pencil className="h-4 w-4" /></span>
                <p className="text-sm font-bold hyphens-none">Guided walkthrough</p>
              </button>
            </div>
          </div>

          {/* share + theme side-by-side on xl — halves page scroll */}
          <div className="grid gap-6 xl:grid-cols-2">
          <div className={panel}>
            <h2 className="text-xl font-black tracking-tight text-slate-900 mb-4">Share</h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={copy} className={btn}>{copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy link"}</button>
              <button onClick={share} className={btn}><Share2 className="h-4 w-4" />Share</button>
              {qrUrl && (
                <a href={qrUrl} download={`${profile.username}-vakilcard-qr.gif`} onClick={() => track("qr_download", profile.id)} className={btn + " no-underline"}>
                  <Download className="h-4 w-4" />Download QR
                </a>
              )}
              <button onClick={() => setShowA2HS((s) => !s)} className={btn}><Smartphone className="h-4 w-4" />Add to Home Screen</button>
            </div>
            {showA2HS && (
              <div className="mt-4 text-sm text-slate-600 space-y-2.5 text-left hyphens-none">
                {installPrompt && (
                  <button onClick={doInstall} className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-3 flex items-center justify-center gap-2 transition-colors">
                    <Smartphone className="h-4 w-4" /> Add to Home Screen — one tap
                  </button>
                )}
                <p><b className="text-slate-900">iPhone:</b> open your card in Safari → Share → "Add to Home Screen".</p>
                {!installPrompt && <p><b className="text-slate-900">Android:</b> open your card in Chrome → ⋮ menu → "Add to Home screen".</p>}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-4 text-left hyphens-none">
              Print the QR on your letterhead, visiting card or chamber board — anyone who scans it lands on your card.
            </p>
          </div>

          {/* theme */}
          <div className={panel}>
            <h2 className="text-xl font-black tracking-tight text-slate-900 mb-4">Theme</h2>
            <div className="flex flex-wrap gap-2">
              {["system", "dark", "light"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  disabled={savingTheme}
                  className={`rounded-full px-5 py-2.5 text-sm font-bold border transition-colors capitalize ${
                    theme === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {t === "system" ? "Match device" : t}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3 text-left hyphens-none">How your public card appears to clients.</p>
            {/* premium themes — Pro */}
            <button
              type="button"
              onClick={() => (pro ? null : setUpgradeFeature("premium_themes"))}
              className={`mt-4 w-full rounded-2xl border p-4 text-left transition-colors ${pro ? "border-slate-200 bg-slate-50 cursor-default" : "border-slate-200 bg-white hover:border-[#635BFF]/50"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-900">Premium themes</p>
                <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Pro</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 text-left hyphens-none">{pro ? "Coming to your plan first — new looks land here." : "Exclusive looks for your public card."}</p>
            </button>
          </div>

          </div>

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
                      <p className="text-xs font-bold text-slate-500">{label}</p>
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
                    <p className="text-xs font-bold text-slate-500">{label}</p>
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
              Signed in {profile.phone ? <>as <b className="text-slate-900">{profile.phone}</b></> : "with Google"} · verified on WhatsApp.
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
