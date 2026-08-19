// VakilCard API client — the single place frontend code talks to the
// identity backend. Phone-first (and only) identity: access JWT (1h) +
// rotating refresh token from /api/vakilcard/auth — stored via this
// module only, refreshed transparently on expiry/401. No ad-hoc token
// handling elsewhere. (Google/Firebase auth was removed.)
//
// DEV-ONLY QA bypass: every call funnels through `call()` below, which asks
// `qaCall()` (lib/vakilcardQa.js) first — that only ever returns a value
// when an in-memory QA session is active, which itself can only start for
// one hardcoded phone number on a non-production build served from a dev
// host (see that module's header comment for the full safety gate). When
// `qaCall()` returns undefined (the normal case), execution falls through to
// the real fetch below, completely unchanged.
import { qaCall, qaActive } from "./vakilcardQa";

const ACCESS_KEY = "vc_access_token";
const REFRESH_KEY = "vc_refresh_token";

/* ---------------- token store ---------------- */

export function setTokens({ access_token, refresh_token }) {
  if (access_token) localStorage.setItem(ACCESS_KEY, access_token);
  if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function hasPhoneSession() {
  return !!localStorage.getItem(REFRESH_KEY);
}

function jwtExpMs(token) {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000;
  } catch {
    return 0;
  }
}

let refreshing = null; // single-flight refresh

async function refreshTokens() {
  if (!refreshing) {
    refreshing = (async () => {
      const refresh_token = localStorage.getItem(REFRESH_KEY);
      if (!refresh_token) return null;
      const r = await fetch("/api/vakilcard/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", refresh_token }),
      });
      if (!r.ok) {
        clearTokens(); // revoked/expired/reused — session is over
        return null;
      }
      const data = await r.json();
      setTokens(data);
      return data.access_token;
    })().finally(() => (refreshing = null));
  }
  return refreshing;
}

/** Current bearer token: fresh phone access token, or null. */
export async function getBearer() {
  const access = localStorage.getItem(ACCESS_KEY);
  if (access) {
    if (jwtExpMs(access) - Date.now() > 30_000) return access;
    const renewed = await refreshTokens();
    if (renewed) return renewed;
  }
  if (localStorage.getItem(REFRESH_KEY)) {
    const renewed = await refreshTokens();
    if (renewed) return renewed;
  }
  return null;
}

export async function logout() {
  const refresh_token = localStorage.getItem(REFRESH_KEY);
  if (refresh_token) {
    try {
      await fetch("/api/vakilcard/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout", refresh_token }),
      });
    } catch {
      /* best effort */
    }
  }
  clearTokens();
}

/* ---------------- api calls ---------------- */

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function call(path, { method = "GET", body, authed = true, retry = true } = {}) {
  // DEV-ONLY QA bypass — see header comment. No-op (returns undefined,
  // falling straight through to the real fetch) unless a QA session is
  // active, which itself requires the dev-build + dev-host gate to pass.
  const qa = await qaCall(path, { method, body });
  if (qa !== undefined) return qa;

  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (authed) {
    const bearer = await getBearer();
    if (!bearer) throw new ApiError("unauthenticated", 401);
    headers["Authorization"] = `Bearer ${bearer}`;
  }
  const r = await fetch(`/api/vakilcard/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && authed && retry && localStorage.getItem(REFRESH_KEY)) {
    // Access token may have just been revoked server-side — one refresh retry.
    const renewed = await refreshTokens();
    if (renewed) return call(path, { method, body, authed, retry: false });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error || `http_${r.status}`, r.status);
  return data;
}

// Auth (unauthenticated actions)
export const startVerification = (phone) =>
  call("auth", { method: "POST", body: { action: "start", phone }, authed: false });
export const resendVerification = (phone) =>
  call("auth", { method: "POST", body: { action: "resend", phone }, authed: false });
export const verifyCode = async (phone, code) => {
  const data = await call("auth", { method: "POST", body: { action: "verify", phone, code }, authed: false });
  setTokens(data);
  return data;
};

// Password auth — the primary login credential (OTP costs money per send;
// it stays available for recovery, device changes and preference).
export const loginPassword = async (phone, password) => {
  const data = await call("auth", { method: "POST", body: { action: "login_password", phone, password }, authed: false });
  setTokens(data);
  return data;
};

// Google sign-in — full alternative to phone (no OTP required). Creates a
// new account on first sign-in (Google-only, no phone attached yet) or logs
// an existing Google-linked account straight in. `id_token` is the GIS
// credential JWT from the browser; verified server-side against Google.
export const googleSignIn = async (id_token) => {
  const data = await call("auth", { method: "POST", body: { action: "google_signin", id_token }, authed: false });
  setTokens(data);
  return data;
};

// Attach + verify a phone number on an ALREADY-authenticated account (e.g.
// a Google-only signup adding a number later for WhatsApp booking alerts).
// Distinct from startVerification/verifyCode, which create a brand-new
// account — these two never touch account creation.
export const linkPhoneStart = (phone) =>
  call("auth", { method: "POST", body: { action: "link_phone_start", phone } });
export const linkPhoneVerify = (phone, code) =>
  call("auth", { method: "POST", body: { action: "link_phone_verify", phone, code } });

export const setPassword = (password) =>
  call("auth", { method: "POST", body: { action: "set_password", password } });
export const changePassword = (current_password, new_password) =>
  call("auth", { method: "POST", body: { action: "change_password", current_password, new_password } });

// Profile
export const getMe = () => call("me");
export const getMyAnalytics = () => call("me?analytics=1");
export const checkUsername = (u) => call(`me?check=${encodeURIComponent(u)}`);
export const saveProfile = (body) => call("me", { method: "POST", body });
export const deleteProfile = () => call("me", { method: "DELETE" });

// Account
export const getAccount = () => call("account");
export const changeUsername = (username) =>
  call("account", { method: "POST", body: { action: "change_username", username } }); // Pro-only (402 pro_required)
export const setUsernameAuto = (full_name) =>
  call("account", { method: "POST", body: { action: "set_username_auto", full_name } });
export const setUsernamePhone = () =>
  call("account", { method: "POST", body: { action: "set_username_phone", consent: true } });
export const linkGoogle = (id_token) =>
  call("account", { method: "POST", body: { action: "link_google", id_token } });

// Booking (Free + Pro; owner-side calls, all authed)
export const getBookingConfig = () => call("booking");
export const saveBookingWindows = (windows) =>
  call("booking", { method: "POST", body: { action: "save_windows", windows } });
export const manageBooking = (request_id, op) =>
  call("booking", { method: "POST", body: { action: "manage", request_id, op } });
export const setBookingStatus = (request_id, status) =>
  call("booking", { method: "POST", body: { action: "manage", request_id, status } });
// Google Calendar connect is a plain browser redirect (OAuth), not a JSON
// call — folded into booking.js (action=gcal_start/gcal_callback/
// gcal_disconnect) rather than its own endpoint file, since Vercel's Hobby
// plan caps a deployment at 12 Serverless Functions and this project was
// already at that ceiling.
// Primary flow: one consent screen grants BOTH Calendar free/busy and
// Business Profile management, and booking.js's shared gcal_callback stores
// both connections from the single resulting token.
export const googleConnectUrl = async () => {
  const bearer = await getBearer();
  return `/api/vakilcard/booking?action=google_connect_start&token=${encodeURIComponent(bearer || "")}`;
};
// Secondary flow: calendar-only, for the edge case where a lawyer's Business
// Profile and Calendar live under different Google accounts — lets them
// connect Calendar under a second account without disturbing Business.
export const googleCalendarConnectUrl = async () => {
  const bearer = await getBearer();
  return `/api/vakilcard/booking?action=gcal_start&token=${encodeURIComponent(bearer || "")}`;
};
export const disconnectGoogleCalendar = () => call("booking", { method: "POST", body: { action: "gcal_disconnect" } });

// Business-only start kept server-side for backward compatibility (see
// booking.js) but no longer linked from the dashboard UI — googleConnectUrl
// above covers it. No client helper needed.
export const disconnectGoogleBusiness = () => call("booking", { method: "POST", body: { action: "google_business_disconnect" } });


// Subscription (Free vs Pro)
export const getSubscription = () => call("subscription");
export const previewCoupon = (code) =>
  call("subscription", { method: "POST", body: { action: "coupon_preview", code } });
export const checkoutPro = (couponCode) =>
  call("subscription", {
    method: "POST",
    body: { action: "checkout", plan: "PRO", ...(couponCode ? { coupon_code: couponCode } : {}) },
  });
export const verifyProPayment = (payload) =>
  call("subscription", { method: "POST", body: { action: "verify_payment", ...payload } });
export const cancelPro = () =>
  call("subscription", { method: "POST", body: { action: "cancel" } });

/** Load Razorpay's checkout.js once; resolves with window.Razorpay. */
let _razorpayScript = null;
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!_razorpayScript) {
    _razorpayScript = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("razorpay_load_failed")));
      s.onerror = () => reject(new Error("razorpay_load_failed"));
      document.head.appendChild(s);
    });
  }
  return _razorpayScript;
}

/** True when an ApiError means "upgrade to Pro" — the standard trigger for
 *  the UpgradeSheet, never a dead end. */
export const isProRequired = (e) => !!e && e.status === 402;

/** True when an ApiError means "not an admin" — used to redirect non-admin
 *  accounts away from /vakilcard/admin instead of showing a raw error. */
export const isForbidden = (e) => !!e && e.status === 403;

// Admin (founder-only — server checks the caller's verified phone against
// VAKILCARD_ADMIN_PHONES; a 403 here means the account isn't on that list,
// not a client-side gate).
export const adminSummary = () => call("admin?action=summary");
export const adminList = ({ q = "", plan = "ALL", page = 1, pageSize = 25 } = {}) =>
  call(`admin?action=list&q=${encodeURIComponent(q)}&plan=${plan}&page=${page}&pageSize=${pageSize}`);
export const adminDetail = (id) => call(`admin?action=detail&id=${encodeURIComponent(id)}`);
export const adminUpgrade = (id, founder = false) =>
  call("admin", { method: "POST", body: { action: "upgrade", id, founder } });
export const adminGrantTrial = (id, days = 14) =>
  call("admin", { method: "POST", body: { action: "grant_trial", id, days } });
export const adminDowngrade = (id) =>
  call("admin", { method: "POST", body: { action: "downgrade", id } });
export const adminSuspend = (id) =>
  call("admin", { method: "POST", body: { action: "suspend", id } });
export const adminUnsuspend = (id) =>
  call("admin", { method: "POST", body: { action: "unsuspend", id } });
export const adminDeleteCard = (id) =>
  call("admin", { method: "POST", body: { action: "delete", id } });

/* ---- Read-only VakilCard Users registry (Part B/C) ---- */
function registryQuery(p = {}) {
  const {
    q = "", verification = "ALL", plan = "ALL", card = "ALL", password = "ALL",
    sort = "NEWEST", page = 1, pageSize = 25,
  } = p;
  return (
    `q=${encodeURIComponent(q)}&verification=${verification}&plan=${plan}` +
    `&card=${card}&password=${password}&sort=${sort}&page=${page}&pageSize=${pageSize}`
  );
}
export const adminRegistry = (params = {}) =>
  call(`admin?action=registry&${registryQuery(params)}`);

/** CSV export — raw (non-JSON) authenticated fetch, returns a Blob for download. */
export const adminRegistryExport = async (params = {}) => {
  const bearer = await getBearer();
  if (!bearer) throw new ApiError("unauthenticated", 401);
  const r = await fetch(`/api/vakilcard/admin?action=registry_export&${registryQuery(params)}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new ApiError(data.error || `http_${r.status}`, r.status);
  }
  return r.blob();
};

/** Fire-and-forget funnel/profile analytics beacon. Skipped during a QA session. */
export function track(event_type, profile_id = null) {
  if (qaActive()) return;
  try {
    navigator.sendBeacon("/api/vakilcard/track", JSON.stringify({ event_type, profile_id }));
  } catch {
    /* analytics never blocks UX */
  }
}
