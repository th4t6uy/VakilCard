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
  ShieldCheck, UserRound, Youtube, Linkedin, Instagram, IndianRupee,
} from "lucide-react";
import {
  startVerification, resendVerification, verifyCode, checkUsername,
  changeUsername, setUsernameAuto, setUsernamePhone, isProRequired, track,
  loginPassword as apiLoginPassword, setPassword as apiSetPassword,
} from "../../lib/vakilcardApi";
import UpgradeSheet from "../../components/UpgradeSheet";
import { isQaPhone, startQaSession, QaBadge } from "../../lib/vakilcardQa";

// Google auth is not live yet. Flip this single flag to bring the buttons
// back — every Google entry point is gated on it (no disabled buttons, no
// placeholders in the meantime).
export const GOOGLE_AUTH_ENABLED = false;

const inputCls =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 focus:border-[#635BFF] focus:outline-none focus:ring-2 focus:ring-[#635BFF]/20 transition-colors";
const primaryBtn =
  "w-full rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-8 py-4 font-bold flex items-center justify-center gap-2 disabled:bg-slate-100 disabled:text-slate-400";
const secondaryBtn =
  "w-full rounded-full bg-white border border-slate-200 hover:border-slate-300 px-8 py-3.5 font-bold text-slate-700 transition-colors";
const glass = "bg-white/80 backdrop-blur-xl border border-slate-200/60 shadow-sm";

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
  server_error: "We hit a problem on our end verifying that. Please try again in a moment.",
  unauthenticated: "Your session expired. Please verify your WhatsApp number again.",
  invalid_credentials: "Phone number or password is incorrect.",
  no_password_set: "This account doesn't have a password yet — sign in with a WhatsApp code once, then set one.",
  too_many_attempts: "Too many attempts. Please wait 15 minutes or sign in with a WhatsApp code.",
  password_too_short: "Password must be at least 8 characters.",
  missing_password: "Please enter your password.",
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
        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
  if (score <= 1) return { label: "Weak", tone: "bg-rose-400", width: "w-1/4", text: "text-rose-600" };
  if (score <= 3) return { label: "Okay", tone: "bg-amber-400", width: "w-2/4", text: "text-amber-600" };
  return { label: "Strong", tone: "bg-emerald-500", width: "w-full", text: "text-emerald-600" };
}

export function StrengthBar({ password }) {
  const s = passwordStrength(password);
  if (!s) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${s.tone} ${s.width}`} />
      </div>
      <span className={`text-[11px] font-bold ${s.text}`}>{s.label}</span>
    </div>
  );
}

/* ---------------- marketing building blocks ---------------- */

// Wide by default on desktop — content spreads instead of stacking into a
// narrow column, cutting scroll length. `narrow` for focused blocks (forms).
const Section = ({ children, className = "", narrow = false }) => (
  <section className={`px-4 sm:px-8 py-8 sm:py-12 ${className}`}>
    <div className={`${narrow ? "max-w-xl" : "max-w-6xl xl:max-w-7xl 2xl:max-w-[88rem]"} mx-auto`}>{children}</div>
  </section>
);

const H2 = ({ children }) => (
  <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 text-center mb-3">{children}</h2>
);

// Text-first tiles: title → visual → caption, all centered on every
// breakpoint, equal vertical rhythm (title mb-4 / visual / caption mt-4).
const FeatureCard = ({ title, caption, children }) => (
  <div className={`${glass} rounded-[2rem] p-6 h-full flex flex-col items-center text-center`}>
    <h3 className="text-xl font-black tracking-tight text-slate-900 text-center">{title}</h3>
    <div className="my-4 flex-1 w-full flex flex-col items-center justify-center">{children}</div>
    <p className="text-sm text-slate-500 text-center hyphens-none mt-auto">{caption}</p>
  </div>
);

const INCLUDED = [
  "Permanent professional profile", "One memorable Vakilpedia link",
  "Chamber information", "Office address with directions", "Contact details",
  "WhatsApp", "Email", "Website", "Practice areas", "About section",
  "UPI payments with QR code", "Shareable digital card", "Save Contact",
  "Professional presence links", "Mobile-friendly experience",
  "WhatsApp verification", "Always up-to-date information", "Free forever",
];

const MiniAction = ({ icon: Icon, label }) => (
  <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white border border-slate-200 py-3.5 min-w-0">
    <Icon className="h-5 w-5 text-slate-700" />
    <span className="text-[10px] font-bold text-slate-600 truncate max-w-full px-0.5">{label}</span>
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
const DS_H = 780;

function DemoPhone({ onCreate }) {
  const frameRef = useRef(null);
  const shellRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | live | fallback
  const [demoHtml, setDemoHtml] = useState(null);
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const measure = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      if (shellRef.current) {
        const w = shellRef.current.clientWidth;
        if (w > 0) setScale(w / DS_W);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
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

  return (
    <div className="mx-auto w-[88vw] max-w-[436px]">
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
        <div className={`relative bg-slate-950 shadow-[0_30px_60px_-15px_rgba(15,23,42,.4)] ${expanded ? "vc-expanded h-full w-full p-0 rounded-none" : "rounded-[3.2rem] p-[10px]"}`}>
          {!expanded && (
            <>
              {/* dynamic island */}
              <div className="absolute top-[18px] left-1/2 -translate-x-1/2 h-[22px] w-[86px] rounded-full bg-slate-950 z-10" aria-hidden="true" />
              {/* glass reflection */}
              <div className="pointer-events-none absolute inset-0 rounded-[3.2rem] z-20" style={{ background: "linear-gradient(115deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 28%, transparent 46%)" }} aria-hidden="true" />
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
            className={`relative overflow-hidden ${expanded ? "h-full rounded-none" : "rounded-[2.6rem]"}`}
            style={{ background: "#050508", ...(expanded ? {} : { height: Math.round(DS_H * s) }) }}
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
                className={`${status === "fallback" ? "" : "absolute inset-0"} bg-white flex flex-col items-center justify-center gap-4 px-6`}
                style={status === "fallback" ? { height: Math.round(DS_H * s) } : undefined}
              >
                <img src="/vakilcard_card.webp" alt="VakilCard preview" className="w-full max-w-[230px] drop-shadow-lg" width="1320" height="791" />
                {status === "fallback" && (
                  <a href="/demo" target="_blank" rel="noopener noreferrer" className="text-[#635BFF] font-bold text-sm">
                    See the live demo →
                  </a>
                )}
              </div>
            )}
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

export default function SignupPage({ onGoogleSignIn, googleSigningIn = false }) {
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

  const railRef = useRef(null);
  // THE single CTA helper — every current and future call-to-action funnels
  // through this. Scrolls to whichever signup card is visible (desktop
  // sticky rail vs mobile in-flow), focuses the phone input with the cursor
  // at the end, and re-asserts focus after the smooth scroll settles. The
  // immediate focus attempt runs inside the click's user-gesture context so
  // mobile browsers open the numeric keypad where policy allows.
  const goToSignup = useCallback(() => {
    const rail = railRef.current;
    const target = rail && rail.offsetParent !== null ? rail : formRef.current;
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
    checking: ["text-slate-500", "Checking availability…"],
    ok: ["text-emerald-700", `Available — vakilpedia.com/${uname.toLowerCase().trim()}`],
    taken: ["text-rose-700", "Already taken."],
    reserved: ["text-rose-700", "Reserved — please pick another."],
    invalid: ["text-rose-700", "3–30 chars: letters, numbers, dots, hyphens, underscores. Not only numbers."],
  }[unameStatus];

  /* ------- verification card (shared between inline + focused views) ------- */

  const renderVerifyCard = (refEl) => (
    <div ref={refEl} className={`${glass} rounded-[2.5rem] p-7 sm:p-9`}>
      {step === "phone" && (
        <>
          <h3 className="text-2xl font-black tracking-tight text-slate-900">
            {manage ? "Manage your VakilCard" : "Ready to claim your VakilCard?"}
          </h3>
          <p className="text-slate-500 mt-2 text-left hyphens-none">
            {manage
              ? "Enter the WhatsApp number your card is registered with — we'll verify it and open your dashboard."
              : "Join the lawyers building their professional identity online. Enter your WhatsApp number to get started."}
          </p>
          <div className="mt-5 flex items-center">
            <span className="rounded-l-2xl border border-r-0 border-slate-200 bg-slate-50 px-3 py-3.5 text-base text-slate-500">+91</span>
            <input
              className={inputCls + " rounded-l-none"}
              type="tel" inputMode="numeric" autoComplete="tel-national"
              placeholder="98765 43210" value={phone} aria-label="Mobile number"
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && phone && sendCode()}
            />
          </div>
          {error && <p className="text-sm font-semibold text-rose-700 mt-3 text-left hyphens-none">{error}</p>}
          <button className={primaryBtn + " mt-5"} disabled={loading || !phone.trim()} onClick={() => sendCode()}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
            Verify on WhatsApp
          </button>
          <p className="text-xs text-slate-500 mt-4 text-center hyphens-none">
            {manage
              ? "One flow for everything: new numbers start onboarding, registered numbers open the dashboard."
              : "No lengthy forms. We'll verify your WhatsApp, reserve your unique VakilCard address, and guide you through creating your professional profile. Your number stays private unless you choose to display it."}
          </p>
          {/* Existing-owner entry — a deliberate, unmissable brand-purple
              tile. Opens the dedicated Welcome Back (password-first) view;
              registration stays exactly where it was behind its ← Back. */}
          <div className="mt-6 rounded-[1.75rem] bg-[#635BFF] p-6 text-center shadow-lg shadow-[#635BFF]/25">
            <p className="text-sm font-bold text-white/90">Already have a VakilCard?</p>
            <button
              type="button"
              className="mt-3 w-full rounded-full bg-white px-6 py-3.5 text-sm font-black text-[#635BFF] hover:bg-slate-50 transition-colors shadow-sm"
              onClick={() => {
                setError("");
                setView("login");
                window.scrollTo(0, 0);
              }}
            >
              Sign In to My VakilCard
            </button>
            {GOOGLE_AUTH_ENABLED && onGoogleSignIn && (
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={googleSigningIn}
                className="mt-3 text-xs font-bold text-white/80 hover:text-white"
              >
                {googleSigningIn ? "Signing in…" : "Have a Google-linked card? Sign in with Google"}
              </button>
            )}
          </div>
        </>
      )}

      {step === "code" && (
        <>
          <h3 className="text-2xl font-black tracking-tight text-slate-900">Check WhatsApp</h3>
          <p className="text-slate-500 mt-2 text-left hyphens-none">
            We sent a 6-digit code to <b className="text-slate-900">{phone}</b>.
            <button className="text-[#635BFF] font-bold ml-2 inline-flex items-center gap-1" onClick={() => { setStep("phone"); setError(""); }}>
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
          {error && <p className="text-sm font-semibold text-rose-700 mt-3 text-left hyphens-none">{error}</p>}
          <button className={primaryBtn + " mt-5"} disabled={loading || code.length !== 6} onClick={submitCode}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            Verify
          </button>
          <button className="w-full text-sm font-bold text-slate-500 mt-4 disabled:opacity-50" disabled={cooldown > 0 || loading} onClick={() => sendCode(true)}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        </>
      )}

      {step === "welcome" && session && (
        <div className="text-center">
          <img src="/vakilcard_card.webp" alt="VakilCard" className="mx-auto w-full max-w-[240px] drop-shadow-xl mb-3" width="1320" height="791" />
          <PartyPopper className="h-10 w-10 text-[#635BFF] mx-auto" />
          <h3 className="text-2xl font-black tracking-tight text-slate-900 mt-3">Welcome to VakilCard</h3>
          <p className="text-slate-500 mt-2 text-center hyphens-none">Your digital chamber is ready. Your address is reserved:</p>
          <p className="font-black text-[#635BFF] mt-2 break-all text-center">vakilpedia.com/{session.username}</p>
          <p className="text-slate-500 mt-2 text-center hyphens-none">Let's personalise it.</p>
          <button className={primaryBtn + " mt-6"} onClick={() => { setPw1(""); setPw2(""); setStep("createpw"); }}>
            Build My VakilCard <ArrowRight className="h-5 w-5" />
          </button>
          <button className={secondaryBtn + " mt-3"} onClick={() => window.location.assign("/")}>Skip for now</button>
        </div>
      )}

      {(step === "createpw" || step === "resetpw") && (
        <>
          <h3 className="text-2xl font-black tracking-tight text-slate-900">
            {step === "resetpw" ? "Create a new password" : "Set your password"}
          </h3>
          <p className="text-slate-500 mt-2 text-left hyphens-none">
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
              {pwTooShort && <p className="text-xs font-semibold text-slate-500 mt-1.5">At least 8 characters.</p>}
            </div>
            <PasswordInput
              value={pw2}
              onChange={setPw2}
              placeholder="Confirm password"
              autoComplete="new-password"
              ariaLabel="Confirm password"
              onEnter={() => pwReady && savePassword(step === "resetpw" ? "dashboard" : "username")}
            />
            {pwMismatch && <p className="text-sm font-semibold text-rose-700">Passwords don't match.</p>}
          </div>
          {error && <p className="text-sm font-semibold text-rose-700 mt-3 text-left hyphens-none">{error}</p>}
          <button
            className={primaryBtn + " mt-5"}
            disabled={loading || !pwReady}
            onClick={() => savePassword(step === "resetpw" ? "dashboard" : "username")}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
            {step === "resetpw" ? "Save & Sign In" : "Save Password"}
          </button>
          {step === "createpw" && (
            <button className="w-full text-sm font-bold text-slate-500 mt-4" onClick={() => setStep("username")}>
              Skip for now — I'll use WhatsApp codes
            </button>
          )}
        </>
      )}

      {step === "username" && session && (
        <>
          <h3 className="text-2xl font-black tracking-tight text-slate-900">Choose your VakilCard Handle</h3>
          <p className="text-slate-500 mt-2 text-left hyphens-none">Your handle becomes your permanent public profile address — <b className="text-slate-700">vakilpedia.com/{(uname || autoPreview || "sidharthgautam").toLowerCase().trim()}</b>. Keep it memorable, unique and professional. You can change it later.</p>
          <p className="text-xs text-slate-400 mt-2 text-left hyphens-none">One link to share with clients, on QR codes, business cards, WhatsApp, email signatures, social media, court filings and your digital visiting card.</p>

          <label className="block mt-5">
            <span className="text-sm font-bold text-slate-700">Your name</span>
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
              className={`w-full text-left rounded-2xl border-2 p-4 transition-colors ${unameChoice === "auto" ? "border-[#635BFF] bg-[#635BFF]/5" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-900">Simple address</p>
                <span className="rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Free</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 break-all">vakilpedia.com/<b className="text-slate-800">{autoPreview}</b></p>
            </button>

            {/* Option 2 — PHONE (free, explicit consent) */}
            <button
              type="button"
              onClick={() => setUnameChoice("phone")}
              className={`w-full text-left rounded-2xl border-2 p-4 transition-colors ${unameChoice === "phone" ? "border-[#635BFF] bg-[#635BFF]/5" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-900">My phone number</p>
                <span className="rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Free</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 break-all">vakilpedia.com/<b className="text-slate-800">{phoneDigits}</b></p>
              {unameChoice === "phone" && (
                <label className="flex items-start gap-2 mt-3 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="accent-[#635BFF] h-4 w-4 mt-0.5"
                    checked={phoneConsent}
                    onChange={(e) => setPhoneConsent(e.target.checked)}
                  />
                  <span className="text-xs font-semibold text-slate-600 text-left hyphens-none">
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
              className={`w-full text-left rounded-2xl border-2 p-4 transition-colors ${unameChoice === "custom" ? "border-[#635BFF] bg-[#635BFF]/5" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-900">Custom username</p>
                <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[10px] font-black uppercase tracking-wider px-2 py-0.5">Pro</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">vakilpedia.com/<b className="text-slate-800">sidharthgautam</b> · vakilpedia.com/<b className="text-slate-800">sidharth-gautam-law</b></p>
              {unameChoice === "custom" && proActive && (
                <div onClick={(e) => e.stopPropagation()} className="mt-3">
                  <div className="flex items-center">
                    <span className="rounded-l-2xl border border-r-0 border-slate-200 bg-slate-50 px-3 py-3.5 text-sm text-slate-500">vakilpedia.com/</span>
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
                        <button key={s} type="button" onClick={() => checkUname(s)} className="rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700 transition-colors">{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </button>
          </div>

          {error && <p className="text-sm font-semibold text-rose-700 mt-3 text-left hyphens-none">{error}</p>}
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

  const bg = { background: "linear-gradient(120deg, rgba(205,239,251,.35), rgba(253,238,203,.35)), #fff" };

  /* ------- Welcome Back — existing users, password-first ------- */

  if (view === "login" && step === "phone") {
    return (
      <div className="min-h-screen flex items-start sm:items-center justify-center" style={bg}>
        <QaBadge />
        <div className="w-full max-w-md px-4 py-10">
          {/* Always-visible escape hatch back to registration. */}
          <button
            type="button"
            onClick={() => { setView("signup"); setError(""); setPassword(""); }}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to registration
          </button>
          <div className={`${glass} rounded-[2.5rem] p-7 sm:p-9`}>
            <h3 className="text-2xl font-black tracking-tight text-slate-900">Welcome back</h3>
            <p className="text-slate-500 mt-2 text-left hyphens-none">
              Sign in with your phone number and password.
            </p>
            <div className="mt-5 flex items-center">
              <span className="rounded-l-2xl border border-r-0 border-slate-200 bg-slate-50 px-3 py-3.5 text-base text-slate-500">+91</span>
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
            {error && <p className="text-sm font-semibold text-rose-700 mt-3 text-left hyphens-none">{error}</p>}
            <button className={primaryBtn + " mt-5"} disabled={loading || !phone.trim() || !password} onClick={submitPasswordLogin}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
              Login
            </button>
            <button
              type="button"
              className="w-full text-sm font-bold text-[#635BFF] mt-4 disabled:opacity-50"
              disabled={loading || !phone.trim()}
              onClick={() => startOtpFlow("reset")}
            >
              Forgot Password?
            </button>

            <div className="flex items-center gap-3 my-5" aria-hidden="true">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <button
              type="button"
              className={secondaryBtn + " flex items-center justify-center gap-2 disabled:opacity-50"}
              disabled={loading || !phone.trim()}
              onClick={() => startOtpFlow("login")}
            >
              <MessageCircle className="h-5 w-5" /> Continue with OTP
            </button>
            {GOOGLE_AUTH_ENABLED && onGoogleSignIn && (
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={googleSigningIn}
                className="w-full text-xs font-bold text-slate-500 hover:text-slate-700 mt-3"
              >
                {googleSigningIn ? "Signing in…" : "Continue with Google"}
              </button>
            )}
            <p className="text-xs text-slate-500 mt-4 text-center hyphens-none">
              Tip: password sign-in is instant — no waiting for a WhatsApp code.
            </p>
          </div>
          <p className="text-center text-xs text-slate-500 mt-6">Powered by Vakilpedia · Free forever</p>
        </div>
      </div>
    );
  }

  // Focused view once verification starts — no marketing noise mid-flow.
  if (step !== "phone") {
    return (
      <div className="min-h-screen flex items-start sm:items-center justify-center" style={bg}>
        <QaBadge />
        <div className="w-full max-w-md px-4 py-10">
          {step === "code" && view === "login" && (
            <button
              type="button"
              onClick={() => { setStep("phone"); setError(""); setCode(""); }}
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </button>
          )}
          {renderVerifyCard(formRef)}
          <p className="text-center text-xs text-slate-500 mt-6">Powered by Vakilpedia · Free forever</p>
        </div>
      </div>
    );
  }

  /* ---------------- product landing + signup ---------------- */

  return (
    <div className="min-h-screen" style={bg}>
      {/* NOTE: no items-start here — the aside must stretch to full column
          height or its sticky child has no room to float while scrolling. */}
      <div className="lg:flex lg:gap-6 xl:gap-8 max-w-[96rem] min-[1700px]:max-w-[1600px] mx-auto lg:px-8">
      <div className="flex-1 min-w-0">
      {/* hero */}
      <Section className="pt-12 sm:pt-16 !pb-4">
        <div className="text-center">
          <span className="inline-block rounded-full bg-white/80 border border-slate-200/60 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-[#635BFF] mb-6">✨ Free Forever</span>
          <img src="/vakilcard_card.webp" alt="VakilCard — Your Practice. One Link." className="mx-auto w-full max-w-[300px] sm:max-w-[360px] drop-shadow-2xl" width="1320" height="791" />
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.02] text-slate-900 mt-7">
            Create your VakilCard.
          </h1>
          <p className="text-xl font-instrument-italic text-slate-700 mt-3 text-center">Your Digital Chamber.</p>
          <p className="text-lg text-slate-600 mt-4 max-w-md mx-auto text-center hyphens-none">
            Your verified digital identity for clients, chambers, payments and professional networking. Your practice. One link.
          </p>
          <p className="text-sm font-bold text-slate-500 mt-4 text-center hyphens-none">
            Built for advocates. Live in under 3 minutes. Verified securely on WhatsApp.
          </p>
          <button onClick={scrollToForm} className="mt-7 rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-9 py-4 font-bold inline-flex items-center gap-2">
            <MessageCircle className="h-5 w-5" /> Get Started — Free
          </button>
        </div>
      </Section>

      {/* interactive product demo — the centerpiece */}
      <Section className="!py-8">
        <p className="text-center text-xs font-black uppercase tracking-widest text-[#635BFF] mb-2">See your future VakilCard</p>
        <p className="text-center text-slate-600 mb-7 max-w-sm mx-auto hyphens-none">
          Everything your clients need. One beautiful, verified profile. Built in under three minutes.
        </p>
        <DemoPhone onCreate={goToSignup} />
        <div className="text-center mt-7">
          <button onClick={() => { track("cta_click"); scrollToForm(); }} className="rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-9 py-4 font-bold inline-flex items-center gap-2">
            Create Mine Free <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </Section>

      {/* why lawyers love it */}
      <Section>
        <H2>Why Lawyers Love VakilCard</H2>
        <p className="text-slate-500 text-center mb-8 hyphens-none">Not a business card. The digital front door to your practice.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <FeatureCard title="One Link. Every Detail." caption="Instead of sending your phone number, chamber address, fee details and payment QR separately, share one VakilCard that contains everything your client needs.">
            <div className="grid grid-cols-5 gap-1.5">
              <MiniAction icon={Phone} label="Call" />
              <MiniAction icon={MessageCircle} label="WhatsApp" />
              <MiniAction icon={Mail} label="Email" />
              <MiniAction icon={Globe} label="Website" />
              <MiniAction icon={UserRound} label="Save" />
            </div>
          </FeatureCard>

          <FeatureCard title="Never Reprint Visiting Cards" caption="Your VakilCard updates instantly whenever you change your office, phone number or website. The same link always stays valid.">
            <div className="flex items-center gap-3 justify-center">
              <span className="h-9 w-9 rounded-xl bg-[#635BFF]/10 flex items-center justify-center flex-none"><Pencil className="h-4 w-4 text-[#635BFF]" /></span>
              <div className="text-sm text-center">
                <p className="font-black text-slate-900 text-center hyphens-none">Edit once. Updated everywhere.</p>
                <p className="text-slate-500 text-center hyphens-none">Your link never changes.</p>
              </div>
            </div>
          </FeatureCard>

          <FeatureCard title="Get Paid Faster" caption="Let clients pay consultation fees with a single tap using your personal UPI QR code. No screenshots. No typing UPI IDs.">
            <div className="flex items-center gap-4 justify-center">
              <div>
                <p className="text-[11px] font-bold text-slate-500 text-center">UPI ID</p>
                <p className="font-black text-slate-900 text-center hyphens-none">yourname@upi</p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-900 text-white text-sm font-bold px-5 py-2"><IndianRupee className="h-4 w-4" />Pay Now</div>
              </div>
              <div className="h-16 w-16 rounded-xl border border-slate-200 bg-white grid grid-cols-4 gap-0.5 p-1.5 flex-none" aria-hidden="true">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} className={`rounded-[2px] ${[0,1,3,4,6,9,10,12,15,5].includes(i) ? "bg-slate-900" : "bg-slate-100"}`} />
                ))}
              </div>
            </div>
          </FeatureCard>

          <FeatureCard title="Help Clients Reach You" caption="Your chamber address and directions are always one tap away. No more sending your location every time someone asks.">
            <div className="flex items-center gap-3 justify-center">
              <span className="h-9 w-9 rounded-xl bg-[#635BFF]/10 flex items-center justify-center flex-none"><MapPin className="h-4 w-4 text-[#635BFF]" /></span>
              <div className="text-sm text-center">
                <p className="font-black text-slate-900 text-center hyphens-none">Your chamber, on the map</p>
                <p className="text-slate-500 text-center hyphens-none">Address · Directions · Office timings</p>
              </div>
            </div>
          </FeatureCard>

          <FeatureCard title="Make Every Interaction Professional" caption="Whether a client finds you through Google, WhatsApp, LinkedIn or a QR code, they always see the same polished professional profile.">
            <div className="flex items-center gap-3 justify-center">
              {[Linkedin, Youtube, Instagram, Globe].map((Icon, i) => (
                <span key={i} className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center"><Icon className="h-4 w-4 text-slate-600" /></span>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard title="Built For Lawyers" caption="Designed specifically for advocates and law firms — not generic business cards. Your enrollment number, chamber details, practice areas and professional identity, exactly the way clients expect.">
            <div className="flex flex-col items-center gap-2.5">
              <div className="flex items-center gap-3 justify-center">
                <span className="h-9 w-9 rounded-xl bg-[#635BFF]/10 flex items-center justify-center flex-none"><Landmark className="h-4 w-4 text-[#635BFF]" /></span>
                <p className="text-sm font-black text-slate-900 text-center hyphens-none">Enrollment · Practice areas · About</p>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {["Civil", "Criminal", "Property"].map((a) => (
                  <span key={a} className="rounded-full bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1">{a}</span>
                ))}
              </div>
            </div>
          </FeatureCard>
        </div>
      </Section>

      {/* everything included */}
      <Section className="!py-6">
        <H2>Every VakilCard includes</H2>
        <div className={`${glass} rounded-[2rem] p-6 sm:p-8 mt-5`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5">
            {INCLUDED.map((item) => (
              <p key={item} className="flex gap-2.5 text-[15px] text-slate-700 justify-center sm:justify-start text-left hyphens-none">
                <Check className="h-4 w-4 text-emerald-600 flex-none mt-1" />{item}
              </p>
            ))}
          </div>
        </div>
      </Section>

      {/* story: visiting card vs VakilCard */}
      <Section>
        <H2>Better than a visiting card</H2>
        <div className="grid sm:grid-cols-2 gap-5 mt-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white/50 p-6">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 text-center sm:text-left">Traditional visiting card</p>
            <ul className="space-y-2 text-[15px] text-slate-500">
              {["Printed once. Outdated tomorrow.", "Gets misplaced.", "Can't accept payments.", "Can't show directions.", "Can't update itself."].map((t) => (
                <li key={t} className="text-center sm:text-left hyphens-none">{t}</li>
              ))}
            </ul>
          </div>
          <div className={`${glass} rounded-[2rem] p-6`}>
            <p className="text-xs font-black uppercase tracking-widest text-[#635BFF] mb-3 text-center sm:text-left">VakilCard</p>
            <ul className="space-y-2 text-[15px] text-slate-800 font-semibold">
              {["Always current.", "Always shareable.", "Always verified.", "Accepts payments.", "Shows your chamber.", "Works on every smartphone."].map((t) => (
                <li key={t} className="flex gap-2 justify-center sm:justify-start text-left hyphens-none"><Check className="h-4 w-4 text-emerald-600 flex-none mt-1" />{t}</li>
              ))}
            </ul>
            <p className="text-sm font-black text-slate-900 mt-4 text-center sm:text-left">One tap. Forever.</p>
          </div>
        </div>
      </Section>

      {/* perfect for */}
      <Section className="!py-6">
        <H2>Perfect for</H2>
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {PERFECT_FOR.map((p) => (
            <span key={p} className="rounded-full bg-white/80 border border-slate-200/60 px-4 py-2 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-600" />{p}
            </span>
          ))}
        </div>
      </Section>

      {/* trust */}
      <Section className="!py-6">
        <div className="text-center">
          <p className="text-sm font-black text-slate-900 inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#635BFF]" />Powered by Vakilpedia</p>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto text-center hyphens-none">
            Built exclusively for India's legal professionals. Privacy-first. Verified through WhatsApp. Free forever. Your mobile number stays private unless you choose to display it.
          </p>
        </div>
      </Section>

      {/* signup card — in-flow on mobile/tablet; desktop uses the sticky rail */}
      <Section className="lg:hidden !pt-4" narrow>{renderVerifyCard(formRef)}</Section>

      {/* faq */}
      <Section className="!pt-2">
        <H2>Questions</H2>
        <div className="grid sm:grid-cols-2 gap-3 mt-5 items-start">
          {FAQS.map(([q, a]) => (
            <details key={q} className={`${glass} rounded-2xl px-5 py-4 group`}>
              <summary className="flex items-center justify-between cursor-pointer list-none font-bold text-slate-800 text-[15px]">
                {q}
                <ChevronDown className="h-4 w-4 text-slate-400 group-open:rotate-180 transition-transform flex-none ml-3" />
              </summary>
              <p className="text-sm text-slate-500 mt-2.5 text-left hyphens-none">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* closing CTA */}
      <Section>
        <div className="text-center py-4">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
            Your next client is already <span className="font-instrument-italic font-normal">searching online.</span>
          </h2>
          <p className="text-slate-600 font-semibold mt-3 text-center">Make sure they find you.</p>
          <p className="text-sm text-slate-500 mt-3 max-w-sm mx-auto text-center hyphens-none">
            Your practice deserves more than a paper visiting card. Verify your WhatsApp. Build your profile. Share one trusted link forever.
          </p>
          <button onClick={() => { track("cta_click"); scrollToForm(); }} className="mt-6 rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-10 py-4 font-bold inline-flex items-center gap-2">
            <MessageCircle className="h-5 w-5" /> Create My Free VakilCard
          </button>
          <p className="text-xs text-slate-500 mt-8 text-center">Powered by Vakilpedia · Free forever</p>
        </div>
      </Section>
      </div>

      {/* desktop: signup card floats on the right, always in sight */}
      <aside className="hidden lg:block w-[380px] 2xl:w-[420px] flex-none">
        <div className="sticky top-8 py-10">
          {renderVerifyCard(railRef)}
          <p className="text-center text-xs text-slate-500 mt-5">Powered by Vakilpedia · Free forever</p>
        </div>
      </aside>
      </div>
    </div>
  );
}
