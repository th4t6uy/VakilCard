// VakilCard signup — combined product landing + signup funnel (mobile-first).
// The page sells the digital chamber BEFORE asking for the number: hero →
// live product preview (the REAL production card for /demo in light + dark,
// iframed inside phone frames — no mockups, one source of truth) → feature
// story → benefits → trust → verification card → FAQ → closing CTA.
// Verification (code/welcome/username) then takes over as a focused view.
//
// Auth model (this sprint): password is the PRIMARY credential for existing
// users (OTP costs money per WhatsApp send). OTP remains for first sign-in,
// device changes, password recovery and personal preference. "Already have
// a VakilCard?" opens a dedicated Welcome Back view with a permanent ← Back.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, Eye, EyeOff, Globe, Landmark,
  Loader2, Lock, Mail, MapPin, MessageCircle, PartyPopper, Pencil, Phone,
  ShieldCheck, IndianRupee, Link2, X,
} from "lucide-react";
import {
  startVerification, resendVerification, verifyCode, checkUsername,
  changeUsername, setUsernameAuto, setUsernamePhone, isProRequired, track,
  loginPassword as apiLoginPassword, setPassword as apiSetPassword,
  googleSignIn,
} from "../../lib/vakilcardApi";
import UpgradeSheet from "../../components/UpgradeSheet";
import SiteNav from "../../components/SiteNav";
import SiteFooter from "../../components/SiteFooter";
import EcosystemRail from "../../components/EcosystemRail";
import { WWW } from "../../config/ecosystem";
import { isQaPhone, startQaSession, QaBadge } from "../../lib/vakilcardQa";

// Google sign-in is live (full alternative to phone — see auth.js
// action=google_signin). Every entry point stays gated on this flag so it
// can be switched off instantly (e.g. if REACT_APP_GOOGLE_SIGNIN_CLIENT_ID
// isn't set on a given deployment, the buttons just don't render — no
// crash, no placeholder).
export const GOOGLE_AUTH_ENABLED = true;

const inputCls =
  "w-full rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-white/5 px-4 py-3.5 text-base text-slate-900 dark:text-white placeholder-slate-400 focus:border-[#635BFF] focus:outline-none focus:ring-2 focus:ring-[#635BFF]/20 transition-colors";
const primaryBtn =
  "w-full rounded-full bg-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white hover:bg-[#635BFF] transition-colors px-8 py-4 font-bold flex items-center justify-center gap-2 disabled:bg-slate-100 dark:disabled:bg-white/[0.05] disabled:text-slate-400 dark:disabled:text-slate-500";
const secondaryBtn =
  "w-full rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 px-8 py-3.5 font-bold text-slate-700 dark:text-slate-300 transition-colors";
const glass = "bg-white/80 dark:bg-white/[0.06] backdrop-blur-xl border border-slate-200/60 dark:border-white/10 shadow-sm";

const ERRORS = {
  invalid_phone: "That doesn't look like a valid mobile number.",
  invalid_input: "That code doesn't look right — it should be 6 digits.",
  cooldown: "Please wait a minute before requesting another code.",
  rate_limited: "Too many attempts. Please try again in an hour.",
  delivery_failed: "We couldn't reach that number on WhatsApp. Check the number and try again.",
  wrong_code: "That code isn't right. Please check WhatsApp and try again.",
  expired: "That code expired. Request a fresh one.",
  locked: "Too many wrong attempts. Request a fresh code.",
  no_session: "Request a code first.",
  awaiting_approval: "Your Vakilpedia account has been created and is awaiting approval. We'll let you know on WhatsApp as soon as it's ready.",
  server_error: "We hit a problem on our end verifying that. Please try again in a moment.",
  unauthenticated: "Your session expired. Please verify your WhatsApp number again.",
  invalid_credentials: "Phone number or password is incorrect.",
  no_password_set: "This account doesn't have a password yet — sign in with a WhatsApp code once, then set one.",
  too_many_attempts: "Too many attempts. Please wait 15 minutes or sign in with a WhatsApp code.",
  password_too_short: "Password must be at least 8 characters.",
  missing_password: "Please enter your password.",
  // Google sign-in — surface the REAL cause instead of the generic fallback,
  // so a missing server-side GOOGLE_SIGNIN_CLIENT_ID reads as what it is.
  google_signin_not_configured: "Google sign-in isn't switched on yet. Please sign in with your phone number instead.",
  missing_id_token: "Google didn't complete that sign-in. Please try again.",
  invalid_id_token: "Google didn't confirm that sign-in. Please try again.",
  email_not_verified: "That Google account's email isn't verified. Use another account or sign in with your phone.",
  google_unreachable: "We couldn't reach Google just now. Please try again in a moment.",
};
const msg = (e) => ERRORS[e && e.code] || "We couldn't complete that just now. Please try again in a moment.";

/* ---------------- password building blocks (shared) ---------------- */

export function PasswordInput({ value, onChange, placeholder = "Password", autoComplete = "current-password", autoFocus = false, onEnter, ariaLabel }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        className={inputCls + " pr-12"}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-label={ariaLabel || placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()}
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}

export function passwordStrength(pw) {
  const s = String(pw || "");
  if (!s) return null;
  let score = 0;
  if (s.length >= 8) score++;
  if (s.length >= 12) score++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^a-zA-Z0-9]/.test(s)) score++;
  if (score <= 1) return { label: "Weak", tone: "bg-rose-400", width: "w-1/4", text: "text-rose-600 dark:text-rose-400" };
  if (score <= 3) return { label: "Okay", tone: "bg-amber-400", width: "w-2/4", text: "text-amber-600 dark:text-amber-400" };
  return { label: "Strong", tone: "bg-emerald-500", width: "w-full", text: "text-emerald-600 dark:text-emerald-400" };
}

export function StrengthBar({ password }) {
  const s = passwordStrength(password);
  if (!s) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-slate-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${s.tone} ${s.width}`} />
      </div>
      <span className={`text-[11px] font-bold ${s.text}`}>{s.label}</span>
    </div>
  );
}

/* ---------------- marketing building blocks ---------------- */

// BORROWED from the marketing site so this page reads as one of its product
// pages (Apps/Vakilpedia-code/frontend-next): SectionHead and FeatureTile are
// SignlinxPage.js's, the layout frame is ProductPageLayout's `wide` + `rail`
// mode, the nav/footer are SiteNav/SiteFooter. VakilCard's accent (#635BFF)
// takes the place of SignLinx's ink blue. Keep them in step with www.
const ACCENT = "#635BFF";

// ProductPageLayout's `wide` text normalisation — globals.css (copied here as
// index.css) justifies every <p> and force-centres headings below 768px; a
// page of tiles wants neither. Applied to the content and rail columns only:
// the sign-in card keeps its own centred lines.
const WIDE_TEXT =
  "[&_h1]:!text-left [&_h2]:!text-left [&_h3]:!text-left [&_h4]:!text-left [&_p]:!text-left [&_li]:!text-left [&_p]:!hyphens-none [&_li]:!hyphens-none";

function SectionHead({ id, eyebrow, children, sub }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400 m-0">{eyebrow}</p>
      <h2 id={id} className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-[-0.03em] mt-2 mb-0">
        {children}
      </h2>
      {sub && <p className="text-slate-600 dark:text-slate-300 mt-3 max-w-2xl leading-relaxed mb-0">{sub}</p>}
    </div>
  );
}

function FeatureTile({ icon: Icon, title, body }) {
  return (
    <div className="flex items-start gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-5 h-full">
      <span className="grid place-items-center w-12 h-12 rounded-2xl flex-none" style={{ backgroundColor: `${ACCENT}12` }} aria-hidden="true">
        <Icon className="w-6 h-6" style={{ color: "var(--vc-accent)" }} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white m-0">{title}</h3>
        <p className="mt-1.5 text-[0.92rem] text-slate-600 dark:text-slate-300 leading-relaxed font-medium mb-0">{body}</p>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Link2, title: "One link. Every detail.", body: "Instead of sending your phone number, chamber address, fee details and payment QR separately, share one VakilCard that contains everything your client needs." },
  { icon: Pencil, title: "Never reprint visiting cards", body: "Your VakilCard updates instantly whenever you change your office, phone number or website. The same link always stays valid." },
  { icon: IndianRupee, title: "Get paid faster", body: "Let clients pay consultation fees with a single tap using your personal UPI QR code. No screenshots. No typing UPI IDs." },
  { icon: MapPin, title: "Help clients reach you", body: "Your chamber address and directions are always one tap away. No more sending your location every time someone asks." },
  { icon: Globe, title: "Professional everywhere", body: "Whether a client finds you through Google, WhatsApp, LinkedIn or a QR code, they always see the same polished professional profile." },
  { icon: Landmark, title: "Built for lawyers", body: "Enrollment number, chamber details, practice areas and professional identity — designed for advocates and law firms, not generic business cards." },
];

const INCLUDED = [
  "Permanent professional profile", "One memorable Vakilpedia link",
  "Chamber information", "Office address with directions", "Contact details",
  "WhatsApp", "Email", "Website", "Practice areas", "About section",
  "UPI payments with QR code", "Shareable digital card", "Save Contact",
  "Professional presence links", "Mobile-friendly experience",
  "WhatsApp verification", "Always up-to-date information", "Free forever",
];

const MiniAction = ({ icon: Icon, label }) => (
  <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 py-3.5 min-w-0">
    <Icon className="h-5 w-5 text-slate-700 dark:text-slate-300" />
    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate max-w-full px-0.5">{label}</span>
  </div>
);

/**
 * The centerpiece: ONE iPhone-sized interactive preview of the REAL
 * production card (SSR renderer in ?demo=1 mode with sample data — one
 * source of truth, no screenshots). Scroll/tap inside works with full
 * visual feedback; no action executes; idle auto-scroll tours the card.
 * Health-checked: if the SSR function isn't reachable (local dev, SPA
 * shell), falls back to the card artwork — never a blank frame.
 */
const DEMO_URL = "/api/vakilcard/profile?demo=1";

// The Design System card is authored at a FIXED 412px width (see the
// handoff: viewport 412x760). It must never reflow to the container —
// squeezing it distorts tile ratios, icons and typography. Instead we
// render the iframe at native size and visually scale it to fit, exactly
// like a real phone viewport.
const DS_W = 412;
// 412x892 is a real phone viewport and gives the frame an iPhone silhouette
// (~2.11 including the bezel; an iPhone display is 2.17). It was 780, which is
// 1.89 -- visibly stubby, and the reason the mockup read as a rounded slab
// rather than a phone even once the corners were right.
//
// Verified against the live card at this exact size before changing it: the
// document fills 892px with no gap, and the card's own .vp-scroll container
// holds 1479px of content, so a taller viewport simply reveals more of a page
// that already scrolls. Nothing is stretched and nothing is letterboxed.
const DS_H = 892;

// Horizontal breathing room either side of the phone on small screens.
const PAGE_GUTTER = 16;
// Bezel thickness at full size; it scales down with the phone so the frame
// keeps its proportions rather than growing a chunky border as it shrinks.
const BEZEL_AT_FULL = 10;
// An iPhone's device corner radius is about 55pt across a 393pt body: 0.14 of
// the width. Holding that RATIO -- rather than a fixed px radius -- is what
// keeps the silhouette reading as a phone at every size.
const IPHONE_RADIUS_RATIO = 0.14;

function DemoPhone({ onCreate }) {
  const frameRef = useRef(null);
  const shellRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | live | fallback
  const [demoHtml, setDemoHtml] = useState(null);
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  // MEASURE THE VIEWPORT, NOT THE SHELL.
  //
  // This used to read shellRef.current.clientWidth -- the very element whose
  // size this scale controls. That is circular, and it settled on the wrong
  // fixed point: at mount the unscaled 412px iframe forced the shell to 412,
  // so scale computed 412/412 = 1, which kept the iframe unscaled, which kept
  // the measurement at 412. Stable, self-consistent, and wrong.
  //
  // Measured on a 375px viewport before the fix: transform was
  // matrix(1,0,0,1,0,0) with the shell clipped to 227px, so 185px of the card
  // was cropped away and the frame stood 800px tall on a 247px body -- aspect
  // 3.24 where an iPhone is 2.16. The "too squircle" corners were the same
  // bug seen from the other side: a fixed 51.2px radius is 14% of a 412px
  // frame and 21% of a 247px one.
  //
  // The viewport cannot be affected by what we render into it, so deriving
  // from it is stable by construction. ResizeObserver is not needed and would
  // reintroduce the loop.
  useEffect(() => {
    const measure = () => {
      const vw = window.innerWidth;
      setViewport({ w: vw, h: window.innerHeight });
      // Page gutter either side, plus the phone's own bezel, then never
      // upscale past the native design width.
      //
      // From lg up the phone sits BESIDE the headline in the centre column
      // of a three-column page (rail | content | sign-in), so it is capped
      // to what that column can spare at each width. Still derived from the
      // viewport only — never from anything this component renders — for
      // the reason above.
      const desktopCap =
        vw >= 1680 ? 340 : vw >= 1536 ? 310 : vw >= 1440 ? 290 : vw >= 1366 ? 240 : vw >= 1280 ? 215 : vw >= 1024 ? 235 : DS_W;
      const avail = Math.min(DS_W, desktopCap, vw - PAGE_GUTTER * 2 - BEZEL_AT_FULL * 2);
      if (avail > 0) setScale(avail / DS_W);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);
  // Mobile: first touch expands the demo into a fullscreen, app-like
  // experience (same iframe DOM node — no reload, no re-render, background
  // scroll locked; ✕ restores the exact page position).
  const [expanded, setExpanded] = useState(false);

  // Load the demo with an EXPLICIT fetch (visible in DevTools as Fetch/XHR —
  // an iframe src loads as a subframe document request and is easy to miss
  // or mis-filter). The verified HTML is injected via srcDoc: one request,
  // deterministic health check, loud console diagnostics on failure.
  useEffect(() => {
    let alive = true;
    fetch(DEMO_URL)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`http_${r.status}`))))
      .then((html) => {
        if (!alive) return;
        if (/VakilCard/i.test(html) && /<html/i.test(html)) {
          setDemoHtml(html);
          setStatus("live");
        } else {
          console.warn("[VakilCardDemo] unexpected response for", DEMO_URL, "— showing fallback (SPA shell answered? function not deployed?)");
          setStatus("fallback");
        }
      })
      .catch((e) => {
        if (!alive) return;
        console.warn("[VakilCardDemo] demo fetch failed:", e.message, "— showing fallback");
        setStatus("fallback");
      });
    return () => { alive = false; };
  }, []);
  const openDemo = () => {
    if (window.innerWidth >= 1024 || status === "fallback") return;
    setExpanded(true);
    document.body.style.overflow = "hidden";
  };
  const closeDemo = () => {
    setExpanded(false);
    document.body.style.overflow = "";
  };
  useEffect(() => () => { document.body.style.overflow = ""; }, []);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => e.key === "Escape" && closeDemo();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Scale factors: in-frame uses the measured shell width; fullscreen uses
  // the real viewport so the card fills edge-to-edge at exact native ratio.
  const s = expanded ? (viewport.w || DS_W) / DS_W : scale || 1;
  const frameH = expanded ? Math.round((viewport.h || DS_H) / s) : DS_H;

  // Every part of the phone shell scales together. Fixed pixel values here are
  // what made a shrunken phone look like a squircle: a 10px bezel and a 51.2px
  // radius are correct on a 412px body and grotesque on a 247px one.
  const bezel = Math.max(5, Math.round(BEZEL_AT_FULL * s));
  const screenW = Math.round(DS_W * s);
  const frameW = screenW + bezel * 2;
  const outerR = Math.round(frameW * IPHONE_RADIUS_RATIO);
  const innerR = Math.max(8, outerR - bezel);
  const island = {
    w: Math.max(48, Math.round(86 * s)),
    h: Math.max(14, Math.round(22 * s)),
    top: Math.max(8, Math.round(18 * s)),
  };

  return (
    // Centred by a flex parent, NOT .mx-auto: index.css forces every .mx-auto
    // to width:100% with 1rem padding below 768px, which squeezed this box
    // narrower than the phone and pushed the frame off-centre.
    <div className="flex justify-center max-w-full">
    <div className="max-w-full" style={expanded ? undefined : { width: frameW }}>
      <style>{`
        @keyframes vcFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @media(min-width:1024px){.vc-float{animation:vcFloat 9s ease-in-out infinite}}
        @keyframes vcExpand{from{transform:scale(.94);opacity:.5}to{transform:scale(1);opacity:1}}
        .vc-expanded{animation:vcExpand .28s ease-out}
      `}</style>
      {/* placeholder preserves layout while the phone is fullscreen — no jump */}
      {expanded && <div style={{ height: "min(680px, 80vh)" }} aria-hidden="true" />}
      <div className={expanded ? "fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm" : "vc-float"}>
        {expanded && (
          <>
            <button
              onClick={closeDemo}
              className="fixed top-4 right-4 z-[60] rounded-full bg-slate-900/85 backdrop-blur text-white text-sm font-bold px-4 py-2.5 inline-flex items-center gap-1.5 shadow-lg"
              aria-label="Close demo"
            >
              ✕ Close Demo
            </button>
            {/* floating CTA inside the immersive demo: close → return →
                scroll to signup → focus the phone field (shared helper) */}
            {onCreate && (
              <button
                onClick={() => { closeDemo(); setTimeout(onCreate, 80); }}
                className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] rounded-full bg-[#635BFF] text-white text-sm font-bold px-6 py-3 shadow-xl"
              >
                Create My VakilCard
              </button>
            )}
          </>
        )}
        <div
          className={`relative bg-slate-950 shadow-[0_30px_60px_-15px_rgba(15,23,42,.4)] ${expanded ? "vc-expanded h-full w-full p-0 rounded-none" : ""}`}
          style={expanded ? undefined : { borderRadius: outerR, padding: bezel, width: frameW }}
        >
          {!expanded && (
            <>
              {/* dynamic island */}
              <div
                className="absolute left-1/2 -translate-x-1/2 rounded-full bg-slate-950 z-10"
                style={{ top: island.top, height: island.h, width: island.w }}
                aria-hidden="true"
              />
              {/* glass reflection */}
              <div className="pointer-events-none absolute inset-0 z-20" style={{ borderRadius: outerR }} style={{ background: "linear-gradient(115deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 28%, transparent 46%)" }} aria-hidden="true" />
              {/* mobile: first touch opens the immersive demo */}
              {status === "live" && (
                <button
                  className="lg:hidden absolute inset-0 z-30 flex items-end justify-center pb-6 bg-transparent"
                  onClick={openDemo}
                  onTouchStart={openDemo}
                  aria-label="Open interactive demo fullscreen"
                >
                  <span className="rounded-full bg-slate-900/85 backdrop-blur text-white text-xs font-bold px-4 py-2 shadow-lg">Tap to try the live demo</span>
                </button>
              )}
            </>
          )}
          <div
            ref={shellRef}
            className={`relative overflow-hidden ${expanded ? "h-full rounded-none" : ""}`}
            style={{
              background: "#050508",
              ...(expanded ? {} : { height: Math.round(DS_H * s), width: screenW, borderRadius: innerR }),
            }}
          >
            {status === "live" && demoHtml && (
              <iframe
                ref={frameRef}
                title="Interactive VakilCard demo"
                srcDoc={demoHtml}
                className="block"
                style={{
                  // Native design size, visually scaled — ratios never change.
                  width: DS_W,
                  height: frameH,
                  transform: `scale(${s})`,
                  transformOrigin: "top left",
                  border: 0,
                  background: "#050508",
                }}
              />
            )}
            {status !== "live" && (
              <div
                className={`${status === "fallback" ? "" : "absolute inset-0"} bg-white dark:bg-[#050508] flex flex-col items-center justify-center gap-4 px-6`}
                style={status === "fallback" ? { height: Math.round(DS_H * s) } : undefined}
              >
                <img src="/vakilcard_card.webp" alt="VakilCard preview" className="w-full max-w-[230px] drop-shadow-lg" width="1320" height="791" />
                {status === "fallback" && (
                  <a href="/demo" target="_blank" rel="noopener noreferrer" className="text-[#635BFF] dark:text-[#a5a0ff] font-bold text-sm">
                    See the live demo →
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

const FAQS = [
  ["How long does setup take?", "Usually less than three minutes. Verify your WhatsApp, answer a few guided questions, publish."],
  ["Can I edit my card later?", "Unlimited edits. Your shared link never changes."],
  ["Can I hide my mobile number?", "Yes. You control exactly what appears publicly — phone, email and UPI are each your choice."],
  ["Is VakilCard free?", "Yes. Core features remain free forever."],
  ["Can clients save my contact?", "One tap downloads your card into their phone book — chamber, timings and link included."],
  ["Can I choose my own link?", "Yes. Pick a personal address like vakilpedia.com/your.name right after verification. Old links redirect forever."],
];

const PERFECT_FOR = [
  "Advocates", "Law Firms", "Senior Counsel", "Arbitrators", "Mediators",
  "Legal Consultants", "Tax Lawyers", "Corporate Lawyers", "Independent Practitioners",
];

/* ---------------- page ---------------- */

export default function SignupPage({ autoGoogleSignIn = false } = {}) {
  const navigate = useNavigate();
  const [step, setStep] = useState("phone"); // phone | code | welcome | createpw | username | resetpw
  const [manage, setManage] = useState(false); // legacy OTP-manage copy (login view supersedes it)
  // view: "signup" (default landing) | "login" (Welcome Back — password-first).
  // Login always shows a visible ← Back that instantly returns to signup:
  // the user is never trapped in login mode.
  const [view, setView] = useState("signup");
  // Why the user is running the OTP flow: "signup" (default onboarding),
  // "login" (existing user prefers OTP) or "reset" (forgot password —
  // OTP verify → create new password → dashboard).
  const [otpIntent, setOtpIntent] = useState("signup");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef(null);
  const formRef = useRef(null);

  const [uname, setUname] = useState("");
  const [unameStatus, setUnameStatus] = useState("");
  const unameTimer = useRef();

  // ---- Google sign-in (full alternative to phone) --------------------
  // Self-contained: loads the Google Identity Services script once, then
  // renders Google's own button into whichever slot is currently mounted
  // (the two entry points below use separate refs since only one is ever
  // in the DOM at a time depending on step/view).
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const googleBtnHero = useRef(null);
  const googleBtnLogin = useRef(null);
  // ?auth=google inbound from the marketing site — fire the One Tap prompt
  // exactly once. A ref (not state) survives the effect below re-running as
  // step/view change without ever re-arming the trigger.
  const autoPromptFiredRef = useRef(false);

  const handleGoogleCredential = useCallback(async (response) => {
    setError("");
    setGoogleSigningIn(true);
    try {
      const data = await googleSignIn(response.credential);
      track("google_signin");
      if (!data.created) {
        // Existing owner — dashboard opens directly, same rule as phone login.
        window.location.assign("/");
        return;
      }
      if (data.full_name && data.full_name !== "Advocate") setFullName(data.full_name);
      track("draft_created", null);
      setSession(data);
      setStep("welcome");
    } catch (e) {
      setError(msg(e));
    } finally {
      setGoogleSigningIn(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!GOOGLE_AUTH_ENABLED) return;
    const clientId = process.env.REACT_APP_GOOGLE_SIGNIN_CLIENT_ID;
    if (!clientId) return; // not configured yet — buttons stay unrendered, no crash

    const renderInto = () => {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential });

      // Auto-start path (?auth=google from the marketing site). One Tap is
      // the only prompt Chrome permits without a prior user gesture — a
      // popup here would just get blocked. Fire-once via the ref; wrapped
      // defensively since a URL param must never surface an error banner —
      // if GIS rejects this for any reason (blocked, no eligible session,
      // FedCM disabled), the rendered button below is still the fallback,
      // identical to today's manual-click behavior.
      if (autoGoogleSignIn && !autoPromptFiredRef.current) {
        autoPromptFiredRef.current = true;
        try {
          window.google.accounts.id.prompt();
        } catch {
          /* silent — button fallback covers this */
        }
      }

      [googleBtnHero.current, googleBtnLogin.current].forEach((node) => {
        if (node && !node.dataset.rendered) {
          window.google.accounts.id.renderButton(node, {
            theme: "outline", size: "large", width: 256, text: "continue_with", shape: "pill",
          });
          node.dataset.rendered = "1";
        }
      });
    };

    if (window.google && window.google.accounts && window.google.accounts.id) {
      renderInto();
      return;
    }
    const existing = document.getElementById("google-identity-script");
    if (existing) {
      existing.addEventListener("load", renderInto);
      return () => existing.removeEventListener("load", renderInto);
    }
    const s = document.createElement("script");
    s.id = "google-identity-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = renderInto;
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, view, handleGoogleCredential, autoGoogleSignIn]);

  useEffect(() => {
    document.title = "VakilCard — Claim your Digital Chamber | Vakilpedia";
    track("otp_started");
  }, []);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code" && codeRef.current) codeRef.current.focus();
    if (step !== "phone") window.scrollTo(0, 0);
  }, [step]);

  // THE single CTA helper — every current and future call-to-action funnels
  // through this. Scrolls to whichever signup card is visible (desktop
  // sticky rail vs mobile in-flow), focuses the phone input with the cursor
  // at the end, and re-asserts focus after the smooth scroll settles. The
  // immediate focus attempt runs inside the click's user-gesture context so
  // mobile browsers open the numeric keypad where policy allows.
  const goToSignup = useCallback(() => {
    // One sign-in card on the page now (it used to be two), so one ref.
    const target = formRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusInput = () => {
      const input = target.querySelector('input[type="tel"]') || target.querySelector("input");
      if (input) {
        input.focus({ preventScroll: true });
        const len = input.value.length;
        try { input.setSelectionRange(len, len); } catch { /* non-text inputs */ }
      }
    };
    focusInput();
    setTimeout(focusInput, 450);
  }, []);
  const scrollToForm = goToSignup; // legacy alias — same behaviour everywhere

  const sendCode = async (resend = false) => {
    setError("");
    // DEV-ONLY QA bypass — see lib/vakilcardQa.js. Only ever true on a
    // non-production build served from a dev host, and only for this exact
    // number; skips WhatsApp OTP delivery and every backend call entirely so
    // the rest of the onboarding funnel can be reviewed without a working
    // backend. Every other phone number always uses the real flow below.
    if (!resend && isQaPhone(phone)) {
      const data = startQaSession();
      if (data) {
        setSession(data);
        track("otp_verified_qa_bypass");
        setStep("welcome");
        return;
      }
    }
    setLoading(true);
    try {
      await (resend ? resendVerification(phone) : startVerification(phone));
      setStep("code");
      setCooldown(60);
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await verifyCode(phone, code);
      setSession(data);
      track("otp_verified");
      if (data.created) track("draft_created", null);
      // Forgot-password: the fresh OTP session authorises setting a new
      // password before entering the dashboard.
      if (otpIntent === "reset" && !data.created) {
        setPw1(""); setPw2("");
        setStep("resetpw");
        return;
      }
      // Routing rule: an existing owner NEVER replays onboarding — their
      // dashboard opens directly. Only a brand-new account goes to welcome.
      // (Hard navigation: this component is rendered BY / when signed out,
      // so a soft navigate to the same path wouldn't re-render the
      // now-authenticated dashboard.)
      if (!data.created) {
        window.location.assign("/");
        return;
      }
      setStep("welcome");
    } catch (e) {
      setError(msg(e));
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  // Password login — the default for existing users (OTP costs money per
  // send; passwords are free). OTP stays one tap away below.
  const submitPasswordLogin = async () => {
    if (!phone.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      await apiLoginPassword(phone, password);
      track("password_login");
      window.location.assign("/");
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  };

  const startOtpFlow = (intent) => {
    setOtpIntent(intent);
    setError("");
    sendCode();
  };

  const pwMismatch = pw1 && pw2 && pw1 !== pw2;
  const pwTooShort = pw1 && pw1.length < 8;
  const pwReady = pw1.length >= 8 && pw1 === pw2;

  // Shared by onboarding ("createpw") and forgot-password ("resetpw").
  const savePassword = async (nextStep) => {
    setError("");
    setLoading(true);
    try {
      await apiSetPassword(pw1);
      track("password_set");
      if (nextStep === "dashboard") window.location.assign("/");
      else setStep(nextStep);
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  };

  const checkUname = (value) => {
    clearTimeout(unameTimer.current);
    const u = value.toLowerCase().trim();
    setUname(value);
    if (!u) return setUnameStatus("");
    if (!/^(?=.{3,30}$)[a-z0-9]+([._-][a-z0-9]+)*$/.test(u) || /^[0-9]+$/.test(u))
      return setUnameStatus("invalid");
    setUnameStatus("checking");
    unameTimer.current = setTimeout(async () => {
      try {
        const r = await checkUsername(u);
        setUnameStatus(r.available ? "ok" : r.reason);
      } catch {
        setUnameStatus("");
      }
    }, 400);
  };

  // ---- three-option username system ----
  const [fullName, setFullName] = useState("");
  const [unameChoice, setUnameChoice] = useState("auto"); // auto | phone | custom
  const [phoneConsent, setPhoneConsent] = useState(false); // MUST stay opt-in
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [proActive, setProActive] = useState(false);

  const phoneDigits = String(phone || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "") || "yourphone";
  // Client-side PREVIEW only — the server generates + uniquifies for real.
  const autoPreview = (() => {
    const words = fullName.toLowerCase().replace(/^adv(ocate)?\.?\s*/i, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
    const initials = words.length >= 2 ? words[0][0] + words[words.length - 1][0] : words.length === 1 ? words[0].slice(0, 2) : "??";
    return initials + phoneDigits.slice(-5);
  })();

  const claimSelectedUsername = async () => {
    setError("");
    setLoading(true);
    try {
      if (unameChoice === "custom") {
        // Pro-gated server-side too — a free session gets the upgrade
        // sheet, never a silent failure.
        await changeUsername(uname.toLowerCase().trim());
      } else if (unameChoice === "phone") {
        await setUsernamePhone(); // consent asserted by the checkbox gate
      } else {
        await setUsernameAuto(fullName.trim());
      }
      navigate("/setup");
    } catch (e) {
      if (isProRequired(e)) {
        setShowUpgrade(true);
      } else {
        setError(
          e.code === "username_taken" ? "Just taken — please pick another." :
          e.code === "username_reserved" ? "That name is reserved." :
          e.code === "consent_required" ? "Please confirm the phone-URL consent first." : msg(e)
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const unameMsg = {
    checking: ["text-slate-500 dark:text-slate-400", "Checking availability…"],
    ok: ["text-emerald-700 dark:text-emerald-300", `Available — vakilpedia.com/${uname.toLowerCase().trim()}`],
    taken: ["text-rose-700 dark:text-rose-300", "Already taken."],
    reserved: ["text-rose-700 dark:text-rose-300", "Reserved — please pick another."],
    invalid: ["text-rose-700 dark:text-rose-300", "3–30 chars: letters, numbers, dots, hyphens, underscores. Not only numbers."],
  }[unameStatus];

  /* ------- verification card (shared between inline + focused views) ------- */

  const renderVerifyCard = (refEl) => (
    <div ref={refEl} className={`${glass} rounded-[2.5rem] p-6 sm:p-8 lg:p-7`}>
      {step === "phone" && (
        <>
          <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {manage ? "Manage your VakilCard" : "Ready to claim your VakilCard?"}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-left hyphens-none">
            {manage
              ? "Enter the WhatsApp number your card is registered with — we'll verify it and open your dashboard."
              : "Join the lawyers building their professional identity online. Enter your WhatsApp number to get started."}
          </p>
          <div className="mt-5 flex items-center">
            <span className="rounded-l-2xl border border-r-0 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.05] px-3 py-3.5 text-base text-slate-500 dark:text-slate-400">+91</span>
            <input
              className={inputCls + " rounded-l-none"}
              type="tel" inputMode="numeric" autoComplete="tel-national"
              placeholder="98765 43210" value={phone} aria-label="Mobile number"
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && phone && sendCode()}
            />
          </div>
          {error && <p className="text-sm font-semibold text-rose-700 dark:text-rose-300 mt-3 text-left hyphens-none">{error}</p>}
          <button className={primaryBtn + " mt-5"} disabled={loading || !phone.trim()} onClick={() => sendCode()}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
            Verify on WhatsApp
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 text-center hyphens-none">
            {manage
              ? "One flow for everything: new numbers start onboarding, registered numbers open the dashboard."
              : "No lengthy forms. We'll verify your WhatsApp, reserve your unique VakilCard address, and guide you through creating your professional profile. Your number stays private unless you choose to display it."}
          </p>
          {/* Existing-owner entry — a deliberate, unmissable brand-purple
              tile. Opens the dedicated Welcome Back (password-first) view;
              registration stays exactly where it was behind its ← Back. */}
          <div className="mt-6 rounded-[1.75rem] bg-[#635BFF] p-5 text-center shadow-lg shadow-[#635BFF]/25">
            <p className="text-sm font-bold text-white/90">Already have a VakilCard?</p>
            <button
              type="button"
              /* vp-dark-audit-ignore: white button on the brand-purple tile; identical in both themes */
              className="mt-3 w-full rounded-full bg-white px-6 py-3.5 text-sm font-black text-[#635BFF] hover:bg-slate-50 transition-colors shadow-sm"
              onClick={() => {
                setError("");
                setView("login");
                window.scrollTo(0, 0);
              }}
            >
              Sign In to My VakilCard
            </button>
            {GOOGLE_AUTH_ENABLED && (
              <div className="mt-3 flex flex-col items-center">
                <p className="text-xs font-bold text-white/80 mb-2">Or sign in with Google</p>
                <div ref={googleBtnHero} className={googleSigningIn ? "opacity-50 pointer-events-none" : ""} />
              </div>
            )}
          </div>
        </>
      )}

      {step === "code" && (
        <>
          <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Check WhatsApp</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-left hyphens-none">
            We sent a 6-digit code to <b className="text-slate-900 dark:text-white">{phone}</b>.
            <button className="text-[#635BFF] dark:text-[#a5a0ff] font-bold ml-2 inline-flex items-center gap-1" onClick={() => { setStep("phone"); setError(""); }}>
              <Pencil className="h-3 w-3" />Edit
            </button>
          </p>
          <input
            ref={codeRef}
            className={inputCls + " mt-5 text-center text-2xl tracking-[0.5em] font-black"}
            type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            placeholder="••••••" value={code} aria-label="6-digit verification code"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && code.length === 6 && submitCode()}
          />
          {error && <p className="text-sm font-semibold text-rose-700 dark:text-rose-300 mt-3 text-left hyphens-none">{error}</p>}
          <button className={primaryBtn + " mt-5"} disabled={loading || code.length !== 6} onClick={submitCode}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            Verify
          </button>
          <button className="w-full text-sm font-bold text-slate-500 dark:text-slate-400 mt-4 disabled:opacity-50" disabled={cooldown > 0 || loading} onClick={() => sendCode(true)}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        </>
      )}

      {step === "welcome" && session && (
        <div className="text-center">
          <img src="/vakilcard_card.webp" alt="VakilCard" className="mx-auto w-full max-w-[240px] drop-shadow-xl mb-3" width="1320" height="791" />
          <PartyPopper className="h-10 w-10 text-[#635BFF] dark:text-[#a5a0ff] mx-auto" />
          <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mt-3">Welcome to VakilCard</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-center hyphens-none">Your digital chamber is ready. Your address is reserved:</p>
          <p className="font-black text-[#635BFF] dark:text-[#a5a0ff] mt-2 break-all text-center">vakilpedia.com/{session.username}</p>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-center hyphens-none">Let's personalise it.</p>
          <button className={primaryBtn + " mt-6"} onClick={() => { setPw1(""); setPw2(""); setStep("createpw"); }}>
            Build My VakilCard <ArrowRight className="h-5 w-5" />
          </button>
          <button className={secondaryBtn + " mt-3"} onClick={() => window.location.assign("/")}>Skip for now</button>
        </div>
      )}

      {(step === "createpw" || step === "resetpw") && (
        <>
          <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {step === "resetpw" ? "Create a new password" : "Set your password"}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-left hyphens-none">
            {step === "resetpw"
              ? "You're verified. Choose a new password for future sign-ins."
              : "Sign in instantly next time with your phone number and password — no waiting for WhatsApp codes."}
          </p>
          <div className="mt-5 space-y-3">
            <div>
              <PasswordInput
                value={pw1}
                onChange={setPw1}
                placeholder="Create password"
                autoComplete="new-password"
                autoFocus
                ariaLabel="Create password"
              />
              <StrengthBar password={pw1} />
              {pwTooShort && <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1.5">At least 8 characters.</p>}
            </div>
            <PasswordInput
              value={pw2}
              onChange={setPw2}
              placeholder="Confirm password"
              autoComplete="new-password"
              ariaLabel="Confirm password"
              onEnter={() => pwReady && savePassword(step === "resetpw" ? "dashboard" : "username")}
            />
            {pwMismatch && <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Passwords don't match.</p>}
          </div>
          {error && <p className="text-sm font-semibold text-rose-700 dark:text-rose-300 mt-3 text-left hyphens-none">{error}</p>}
          <button
            className={primaryBtn + " mt-5"}
            disabled={loading || !pwReady}
            onClick={() => savePassword(step === "resetpw" ? "dashboard" : "username")}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
            {step === "resetpw" ? "Save & Sign In" : "Save Password"}
          </button>
          {step === "createpw" && (
            <button className="w-full text-sm font-bold text-slate-500 dark:text-slate-400 mt-4" onClick={() => setStep("username")}>
              Skip for now — I'll use WhatsApp codes
            </button>
          )}
        </>
      )}

      {step === "username" && session && (
        <>
          <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Choose your VakilCard Handle</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-left hyphens-none">Your handle becomes your permanent public profile address — <b className="text-slate-700 dark:text-slate-300">vakilpedia.com/{(uname || autoPreview || "sidharthgautam").toLowerCase().trim()}</b>. Keep it memorable, unique and professional. You can change it later.</p>
          <p className="text-xs text-slate-400 mt-2 text-left hyphens-none">One link to share with clients, on QR codes, business cards, WhatsApp, email signatures, social media, court filings and your digital visiting card.</p>

          <label className="block mt-5">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Your name</span>
            <input
              className={inputCls + " mt-1.5"}
              placeholder="Sidharth Gautam"
              value={fullName}
              aria-label="Your full name"
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>

          <div className="mt-4 space-y-3">
            {/* Option 1 — AUTO (free, default) */}
            <button
              type="button"
              onClick={() => setUnameChoice("auto")}
              className={`w-full text-left rounded-2xl border-2 p-4 transition-colors ${unameChoice === "auto" ? "border-[#635BFF] bg-[#635BFF]/5" : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-white/20"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-900 dark:text-white">Simple address</p>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Free</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">vakilpedia.com/<b className="text-slate-800 dark:text-white">{autoPreview}</b></p>
            </button>

            {/* Option 2 — PHONE (free, explicit consent) */}
            <button
              type="button"
              onClick={() => setUnameChoice("phone")}
              className={`w-full text-left rounded-2xl border-2 p-4 transition-colors ${unameChoice === "phone" ? "border-[#635BFF] bg-[#635BFF]/5" : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-white/20"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-900 dark:text-white">My phone number</p>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Free</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">vakilpedia.com/<b className="text-slate-800 dark:text-white">{phoneDigits}</b></p>
              {unameChoice === "phone" && (
                <label className="flex items-start gap-2 mt-3 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="accent-[#635BFF] h-4 w-4 mt-0.5"
                    checked={phoneConsent}
                    onChange={(e) => setPhoneConsent(e.target.checked)}
                  />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 text-left hyphens-none">
                    My phone number will become part of my public VakilCard URL.
                  </span>
                </label>
              )}
            </button>

            {/* Option 3 — CUSTOM (Pro) */}
            <button
              type="button"
              onClick={() => {
                setUnameChoice("custom");
                if (!proActive) setShowUpgrade(true);
              }}
              className={`w-full text-left rounded-2xl border-2 p-4 transition-colors ${unameChoice === "custom" ? "border-[#635BFF] bg-[#635BFF]/5" : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-white/20"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-900 dark:text-white">Custom username</p>
                <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] dark:text-[#a5a0ff] text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Pro</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">vakilpedia.com/<b className="text-slate-800 dark:text-white">sidharthgautam</b> · vakilpedia.com/<b className="text-slate-800 dark:text-white">sidharth-gautam-law</b></p>
              {unameChoice === "custom" && proActive && (
                <div onClick={(e) => e.stopPropagation()} className="mt-3">
                  <div className="flex items-center">
                    <span className="rounded-l-2xl border border-r-0 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.05] px-3 py-3.5 text-sm text-slate-500 dark:text-slate-400">vakilpedia.com/</span>
                    <input
                      className={inputCls + " rounded-l-none"} autoCapitalize="none" autoCorrect="off"
                      placeholder="your.name" value={uname} aria-label="Choose username"
                      onChange={(e) => checkUname(e.target.value)}
                    />
                  </div>
                  {unameMsg && <p className={`mt-2 text-xs text-left hyphens-none font-semibold ${unameMsg[0]}`}>{unameMsg[1]}</p>}
                  {(unameStatus === "taken" || unameStatus === "reserved") && (
                    <div className="mt-2 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs font-semibold text-slate-400 self-center">Try:</span>
                      {[`${uname.toLowerCase().trim()}law`, `adv${uname.toLowerCase().trim()}`, `${uname.toLowerCase().trim()}1`].map((s) => (
                        <button key={s} type="button" onClick={() => checkUname(s)} className="rounded-full bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/15 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors">{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </button>
          </div>

          {error && <p className="text-sm font-semibold text-rose-700 dark:text-rose-300 mt-3 text-left hyphens-none">{error}</p>}
          <button
            className={primaryBtn + " mt-5"}
            disabled={
              loading ||
              (unameChoice === "phone" && !phoneConsent) ||
              (unameChoice === "custom" && (!proActive || unameStatus !== "ok"))
            }
            onClick={claimSelectedUsername}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            Continue
          </button>

          <UpgradeSheet
            open={showUpgrade}
            feature="custom_username"
            onClose={() => {
              setShowUpgrade(false);
              // Cancelled: return to the free default, exactly as promised.
              if (!proActive) setUnameChoice("auto");
            }}
            onUpgraded={() => setProActive(true)}
          />
        </>
      )}
    </div>
  );

  // Every view on this page wears the marketing site's frame: the one
  // animated backdrop, the global nav and the global footer — exactly what
  // ProductPageLayout + SiteShell give every page on www.
  const openLogin = () => {
    setError("");
    setView("login");
    window.scrollTo(0, 0);
  };
  const frame = (children, cta) => (
    <div className="min-h-screen bg-transparent font-inter-tight selection:bg-slate-900 selection:text-white">
      <div className="bg-animated" aria-hidden="true"><div className="bg-glow-amber" /></div>
      <QaBadge />
      <SiteNav cta={cta} />
      {children}
      <SiteFooter />
    </div>
  );
  const poweredBy = <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-5">Powered by Vakilpedia · Free forever</p>;

  /* ------- Welcome Back — existing users, password-first ------- */

  if (view === "login" && step === "phone") {
    return frame(
      <main className="relative z-10 pt-28 sm:pt-32 lg:pt-36 pb-16 px-4">
        <div className="w-full max-w-md mx-auto">
          {/* Always-visible escape hatch back to registration. */}
          <button
            type="button"
            onClick={() => { setView("signup"); setError(""); setPassword(""); }}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to registration
          </button>
          <div className={`${glass} rounded-[2.5rem] p-7 sm:p-9`}>
            <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Welcome back</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-left hyphens-none">
              Sign in with your phone number and password.
            </p>
            <div className="mt-5 flex items-center">
              <span className="rounded-l-2xl border border-r-0 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.05] px-3 py-3.5 text-base text-slate-500 dark:text-slate-400">+91</span>
              <input
                className={inputCls + " rounded-l-none"}
                type="tel" inputMode="numeric" autoComplete="tel-national"
                placeholder="98765 43210" value={phone} aria-label="Mobile number"
                autoFocus={!phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && phone && password && submitPasswordLogin()}
              />
            </div>
            <div className="mt-3">
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder="Password"
                autoComplete="current-password"
                autoFocus={!!phone}
                ariaLabel="Password"
                onEnter={submitPasswordLogin}
              />
            </div>
            {error && <p className="text-sm font-semibold text-rose-700 dark:text-rose-300 mt-3 text-left hyphens-none">{error}</p>}
            <button className={primaryBtn + " mt-5"} disabled={loading || !phone.trim() || !password} onClick={submitPasswordLogin}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
              Login
            </button>
            <button
              type="button"
              className="w-full text-sm font-bold text-[#635BFF] dark:text-[#a5a0ff] mt-4 disabled:opacity-50"
              disabled={loading || !phone.trim()}
              onClick={() => startOtpFlow("reset")}
            >
              Forgot Password?
            </button>

            <div className="flex items-center gap-3 my-5" aria-hidden="true">
              <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            </div>

            <button
              type="button"
              className={secondaryBtn + " flex items-center justify-center gap-2 disabled:opacity-50"}
              disabled={loading || !phone.trim()}
              onClick={() => startOtpFlow("login")}
            >
              <MessageCircle className="h-5 w-5" /> Continue with OTP
            </button>
            {GOOGLE_AUTH_ENABLED && (
              <div className="mt-3 flex justify-center">
                <div ref={googleBtnLogin} className={googleSigningIn ? "opacity-50 pointer-events-none" : ""} />
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 text-center hyphens-none">
              Tip: password sign-in is instant — no waiting for a WhatsApp code.
            </p>
          </div>
          {poweredBy}
        </div>
      </main>,
      null
    );
  }

  // Focused view once verification starts — no marketing noise mid-flow.
  if (step !== "phone") {
    return frame(
      <main className="relative z-10 pt-28 sm:pt-32 lg:pt-36 pb-16 px-4">
        <div className="w-full max-w-md mx-auto">
          {step === "code" && view === "login" && (
            <button
              type="button"
              onClick={() => { setStep("phone"); setError(""); setCode(""); }}
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </button>
          )}
          {renderVerifyCard(formRef)}
          {poweredBy}
        </div>
      </main>,
      null
    );
  }

  /* ---------------- product landing + signup ---------------- */

  // ONE grid, three columns on xl — the cross-sell rail on the left (as on
  // every free-tool page on www), the page in the middle, the sign-in card on
  // the right (as on /courtque). On lg the rail folds under the content; on a
  // phone everything is one column in reading order: headline → sign-in →
  // live demo → the rest → rail. The sign-in card exists ONCE in the DOM: it
  // used to be rendered twice (in-flow + sticky rail), which also meant the
  // Google button's single ref could only ever land in one of them.
  //
  // The hero wrapper is `contents` below lg so its two children join the
  // outer grid and the sign-in card can sit BETWEEN them on a phone; from lg
  // it is a real two-column box (headline | phone).
  return frame(
    <main className="relative z-10 pt-28 sm:pt-32 lg:pt-36 pb-16">
      <div className="mx-auto max-w-[112rem] px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-6 lg:gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[17rem_minmax(0,1fr)_22rem] 2xl:grid-cols-[19rem_minmax(0,1fr)_24rem] lg:grid-rows-[auto_auto_auto] xl:grid-rows-[auto_1fr]">

          {/* ── Hero: headline | live phone ─────────────────────────────── */}
          <div className="contents lg:grid lg:col-start-1 lg:row-start-1 xl:col-start-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-6 2xl:gap-10 lg:items-center">
            <div className={`order-1 lg:order-none min-w-0 ${WIDE_TEXT}`}>
              <div className="flex items-center gap-4">
                <img src="/app-icons/vakilcard.webp" alt="" width={64} height={64} className="w-14 h-14 sm:w-16 sm:h-16 rounded-[22.37%] object-cover flex-none shadow-lg shadow-slate-900/10" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">VakilCard</span>
                    <span className="text-[0.6rem] font-black uppercase tracking-[0.1em] px-2.5 py-1 rounded-full" style={{ backgroundColor: `${ACCENT}14`, color: "var(--vc-accent)" }}>
                      Free forever
                    </span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 italic text-base m-0">Your Digital Chamber.</p>
                </div>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[2.4rem] min-[1440px]:text-5xl 2xl:text-6xl font-black text-slate-900 dark:text-white tracking-[-0.04em] leading-[1.02] mt-6 mb-0">
                Create your VakilCard.
              </h1>
              <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed mt-4 mb-0 max-w-xl">
                Your verified digital identity for clients, chambers, payments and professional networking.
              </p>
              <p className="font-instrument-italic text-slate-900 dark:text-white text-2xl mt-3 mb-0">Your practice. One link.</p>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-3 mb-0">
                Built for advocates. Live in under 3 minutes. Verified securely on WhatsApp.
              </p>

              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mt-6 [&>button]:whitespace-nowrap">
                <button onClick={() => { track("cta_click"); goToSignup(); }} className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-sm font-bold hover:bg-[#635BFF] transition-colors">
                  <MessageCircle className="h-4 w-4" /> Get Started — Free
                </button>
                <button onClick={openLogin} className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
                  I already have one
                </button>
              </div>

              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400 mt-7 mb-2">Perfect for</p>
              <div className="flex flex-wrap gap-1.5">
                {PERFECT_FOR.map((p) => (
                  <span key={p} className="rounded-full bg-white/80 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1">
                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />{p}
                  </span>
                ))}
              </div>
            </div>

            <div className="order-3 lg:order-none min-w-0">
              <DemoPhone onCreate={goToSignup} />
              <p className="text-center text-[11px] font-black uppercase tracking-widest mt-4 mb-0" style={{ color: "var(--vc-accent)" }}>
                See your future VakilCard
              </p>
            </div>
          </div>

          {/* ── Sign-in card — right column, sticky; second on a phone ─── */}
          <aside className="order-2 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-3 xl:col-start-3 xl:row-span-2 lg:self-stretch" aria-label="Create or sign in to your VakilCard">
            <div className="lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {renderVerifyCard(formRef)}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 px-2 text-center hyphens-none leading-relaxed">
                <span className="inline-flex items-center gap-1.5 font-black text-slate-800 dark:text-white"><ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--vc-accent)" }} />Powered by Vakilpedia</span>
                <br />
                Privacy-first. Your mobile number stays private unless you choose to display it.
              </p>
            </div>
          </aside>

          {/* ── The rest of the page — centre column ────────────────────── */}
          <div className={`order-4 lg:order-none lg:col-start-1 lg:row-start-2 xl:col-start-2 min-w-0 space-y-12 sm:space-y-14 lg:pt-6 ${WIDE_TEXT}`}>

            <div role="region" aria-labelledby="why">
              <SectionHead id="why" eyebrow="Why lawyers love VakilCard">
                Not a business card. <span style={{ color: "var(--vc-accent)" }}>The front door to your practice.</span>
              </SectionHead>
              {/* Phones: one swipeable row (snap) instead of six stacked tiles —
                  about 1,300px of scrolling becomes one tile's height. */}
              <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mt-6 flex sm:grid sm:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-2 sm:pb-0" style={{ scrollbarWidth: "none" }}>
                {FEATURES.map((f) => (
                  <div key={f.title} className="snap-start flex-none w-[80%] min-[480px]:w-[60%] sm:w-auto">
                    <FeatureTile {...f} />
                  </div>
                ))}
              </div>
              <p className="sm:hidden text-[11px] font-bold text-slate-400 mt-2 mb-0">Swipe for more →</p>
            </div>

            <div role="region" aria-labelledby="included">
              <SectionHead id="included" eyebrow="Free forever">Every VakilCard includes</SectionHead>
              <ul className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-5 sm:p-6 mt-6 grid grid-cols-2 min-[1440px]:grid-cols-3 gap-x-4 sm:gap-x-5 gap-y-2 list-none m-0">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex gap-1.5 sm:gap-2 text-[13px] sm:text-sm text-slate-700 dark:text-slate-300 leading-snug">
                    <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 dark:text-emerald-400 flex-none mt-0.5" />{item}
                  </li>
                ))}
              </ul>
            </div>

            {/* The estate's dark band (SignLinx's "proof" block), used for
                the one comparison on this page. */}
            <div role="region" aria-labelledby="compare">
              <div className="rounded-[2rem] bg-slate-900 dark:bg-white/[0.06] dark:border dark:border-white/10 text-white px-6 sm:px-10 py-10">
                <div className="grid md:grid-cols-2 gap-8 md:gap-10 items-start">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A5A0FF] m-0">Better than a visiting card</p>
                    <h2 id="compare" className="text-2xl sm:text-3xl font-black tracking-tight m-0 mt-3 text-white">One tap. Forever.</h2>
                    <ul className="mt-5 grid grid-cols-2 md:grid-cols-1 gap-x-3 gap-y-2 list-none p-0 m-0">
                      {["Always current.", "Always shareable.", "Always verified.", "Accepts payments.", "Shows your chamber.", "Works on every smartphone."].map((t) => (
                        <li key={t} className="flex gap-2 text-[15px] font-semibold text-white"><Check className="h-4 w-4 text-emerald-400 flex-none mt-1" />{t}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-[1.5rem] bg-white/5 dark:bg-white/[0.06] border border-white/10 p-6">
                    <p className="text-[0.62rem] font-black uppercase tracking-[0.2em] text-slate-400 m-0">Traditional visiting card</p>
                    <ul className="mt-4 space-y-2 list-none p-0 m-0">
                      {["Printed once. Outdated tomorrow.", "Gets misplaced.", "Can't accept payments.", "Can't show directions.", "Can't update itself."].map((t) => (
                        <li key={t} className="flex gap-2 text-[15px] text-slate-400"><X className="h-4 w-4 text-slate-500 dark:text-slate-400 flex-none mt-1" />{t}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div role="region" aria-labelledby="faq">
              <SectionHead id="faq" eyebrow="Questions">Before you start</SectionHead>
              <div className="grid sm:grid-cols-2 gap-3 mt-6 items-start">
                {FAQS.map(([q, a]) => (
                  <details key={q} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl px-5 py-4 group">
                    <summary className="flex items-center justify-between cursor-pointer list-none font-bold text-slate-800 dark:text-white text-[15px]">
                      {q}
                      <ChevronDown className="h-4 w-4 text-slate-400 group-open:rotate-180 transition-transform flex-none ml-3" />
                    </summary>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2.5 mb-0">{a}</p>
                  </details>
                ))}
              </div>
            </div>

            {/* Closing CTA — the estate's amber band (SignLinx, CourtQue). */}
            <div>
              <div className="bg-gradient-to-r from-amber-50 dark:from-amber-500/10 to-slate-50 dark:to-white/[0.04] border border-amber-200 dark:border-amber-500/30 rounded-[2rem] py-10 px-6 sm:px-10 grid 2xl:grid-cols-[1fr_auto] gap-6 2xl:gap-10 items-center">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-[-0.03em] m-0">
                    Your next client is already <span className="font-instrument-italic font-normal">searching online.</span>
                  </h2>
                  <p className="text-slate-600 dark:text-slate-300 mt-3 max-w-2xl leading-relaxed mb-0">
                    Verify your WhatsApp. Build your profile. Share one trusted link forever.
                  </p>
                </div>
                <button onClick={() => { track("cta_click"); goToSignup(); }} className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-sm font-bold hover:bg-[#635BFF] transition-colors w-full sm:w-auto justify-self-start">
                  <MessageCircle className="h-4 w-4" /> Create My Free VakilCard
                </button>
              </div>
            </div>
          </div>

          {/* ── More from Vakilpedia — left rail on xl, under the page below ── */}
          <aside className={`order-5 lg:order-none lg:col-start-1 lg:row-start-3 xl:row-start-1 xl:row-span-2 lg:self-stretch ${WIDE_TEXT}`} aria-label="More from Vakilpedia">
            <div className="hidden xl:block sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-[2rem]" style={{ scrollbarWidth: "thin" }}>
              <EcosystemRail origin={WWW} exclude={["VakilCard"]} />
            </div>
            <div className="xl:hidden">
              <EcosystemRail origin={WWW} exclude={["VakilCard"]} compactGrid />
            </div>
          </aside>
        </div>
      </div>
    </main>,
    { label: "Sign In", onClick: openLogin }
  );
}
