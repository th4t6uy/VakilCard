// Physical NFC card resolver + self-serve activation.
//   GET  /nfc/:code  (rewritten to /api/vakilcard/nfc?code=:code by vercel.json)
//        -> bound card:   301 redirect to the owner's live VakilCard
//        -> unbound card: serves a standalone activation page (phone OTP,
//           no dependency on the React SPA) that binds the card on success
//        -> unknown/revoked: branded error page
//   POST /api/vakilcard/nfc  { action: "bind", code }   (Bearer auth required)
//        Binds an unbound card to the caller's account. Idempotent if the
//        caller already owns it; 409 if it's already someone else's card —
//        binding NEVER silently steals a card from another account.
//
// Consent (2026-10-01, founder: "NO silent consents assumed"): after the OTP proves the phone and
// BEFORE the card is bound, the page shows the shared consent card (api/vakilcard/_consentClient.js)
// listing every agreement still owed; one tap on "Accept all & continue" records it for real
// through auth.js (actions legal_outstanding / legal_accept -> supracore_legal_accept). The page
// no longer sends any "I agreed" flag, and there is no tick box.
//
// Design note: the tag itself is written+locked once, at manufacturing time,
// with this opaque code and nothing else. Nothing here ever touches the
// physical chip again — "reassigning" a card is only ever this table.
const { db, esc, jsStr, readJsonBody, resolveAccount, trackEvent } = require("./_lib");
const { consentClientSource } = require("./_consentClient");

// Owner dashboard's own domain (cut over 2026-08-04) — see auth.js/profile.js.
// The public card itself lives on the root marketing domain (same SITE
// constant as profile.js/auth.js) — every published-card redirect must be
// absolute, or it resolves against vakilcard.vakilpedia.com (the dashboard
// host) and lands on the wrong site.
const SITE = "https://www.vakilpedia.com";
const DASHBOARD_SITE = process.env.VAKILCARD_DASHBOARD_URL || "https://vakilcard.vakilpedia.com";
const CODE_RE = /^[a-z0-9]{6,16}$/;
// The Vakilpedia Account: where the agreement text is read from and where "I don't accept" leads.
const ACCOUNT_ORIGIN = process.env.ACCOUNT_ORIGIN || "https://account.vakilpedia.com";

// CourtQue MPHC-kiosk beta offer, shown once right after a fresh card
// activation — "first touch VakilCard, second touch CourtQue" (2026-08-15).
// Redemption itself goes through auth.js's redeem_courtque_beta action;
// this is just the WhatsApp deep link shown on success. Left unset shows a
// generic "we'll be in touch" message instead of a dead/wrong link — a wrong
// phone number here is worse than no link at all.
const COURTQUE_WHATSAPP_URL = process.env.COURTQUE_WHATSAPP_URL || "";

// Shared Vakilpedia/VakilCard lockup for the standalone (non-SPA) pages
// below — mirrors the header treatment used across the React app (see
// VakilCardPage.js's "Vakilpedia product lockup"), hand-written in inline
// styles since these pages have no Tailwind/React available.
const BRAND_HEADER = `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:22px"><img src="/vakilcard-pwa-192.png" alt="" style="height:28px;width:28px;border-radius:8px;object-fit:cover;flex:none;box-shadow:0 2px 6px rgba(0,0,0,.15)"><span style="font-weight:900;letter-spacing:-0.02em;color:#0f172a;font-size:17px">Vakilpedia<sup style="font-size:9px;font-weight:600;margin-left:1px;vertical-align:super">TM</sup></span><span style="border-radius:999px;background:#0f172a;color:#fff;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;padding:4px 9px">VakilCard</span></div>`;

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function errorPage(res, status, title, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Cache-Control", "no-store");
  res.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | VakilCard</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:linear-gradient(120deg,#CDEFFB,#FDEECB)"><div style="text-align:center;padding:24px;max-width:420px">${BRAND_HEADER}<h1 style="font-weight:900">${esc(title)}</h1><p style="color:#475569">${body}</p></div></body></html>`
  );
}

async function loadCard(code) {
  const rows = await db(
    `vakilcard_physical_cards?code=eq.${encodeURIComponent(code)}&select=code,status,account_id,claimed_at`
  );
  return rows[0] || null;
}

async function profileForAccount(accountId) {
  const rows = await db(
    `vakilcard_profiles?account_id=eq.${accountId}&select=id,username,is_published`
  );
  return rows[0] || null;
}

/** Self-contained activation page: phone -> OTP -> bind. No SPA dependency
 *  (this must work the very first time a customer ever taps a card, before
 *  they have any app/session). Uses the existing /api/vakilcard/auth
 *  contract verbatim (see auth.js) — same OTP flow every VakilCard signup
 *  already goes through. */
function claimPage(code) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Activate your VakilCard</title>
<meta name="robots" content="noindex">
<style>
  body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(120deg,#CDEFFB,#FDEECB);padding:24px;box-sizing:border-box}
  .card{background:#fff;border-radius:20px;padding:32px 24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.12)}
  h1{font-size:20px;font-weight:900;margin:0 0 6px}
  p{color:#475569;font-size:14px;line-height:1.5;margin:0 0 20px}
  input{width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:16px;margin-bottom:12px}
  button{width:100%;padding:13px;border:none;border-radius:10px;background:#635BFF;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
  button:disabled{opacity:.5;cursor:default}
  .err{color:#DC2626;font-size:13px;margin:-4px 0 12px;min-height:16px}
  .step{display:none}
  .step.active{display:block}
  /* Consent card (same wording and behaviour as the Account's shared card) */
  .cs-h{font-size:20px;font-weight:900;margin:0 0 6px;color:#0f172a}
  .cs-intro{color:#475569;font-size:13px;line-height:1.5;margin:0 0 12px}
  .cs-list{list-style:none;margin:0 0 12px;padding:0;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;max-height:38vh;overflow-y:auto}
  .cs-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #E2E8F0}
  .cs-row:last-child{border-bottom:none}
  .cs-title{flex:1;min-width:0;font-size:13px;font-weight:700;color:#0f172a;line-height:1.35}
  .cs-ver{display:block;font-size:11px;font-weight:400;color:#94A3B8}
  button.cs-read{flex:none;width:auto;padding:6px 12px;border-radius:999px;background:#fff;color:#0f172a;border:1.5px solid #CBD5E1;font-size:12px;font-weight:700}
  button.cs-accept{border-radius:999px;padding:14px}
  button.cs-ghost{background:#fff;color:#635BFF;border:1.5px solid #CBD5E1;border-radius:999px;margin-top:10px}
  .cs-error{color:#B91C1C;background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:8px 10px;font-size:12.5px;line-height:1.4;margin:0 0 10px;overflow-wrap:anywhere}
  .cs-status{color:#475569;font-size:14px;line-height:1.5;padding:12px 0}
  .cs-decline{text-align:center;font-size:11.5px;color:#94A3B8;margin:10px 0 0;line-height:1.5}
  .cs-decline a{color:#64748B;font-weight:600;text-decoration:underline}
  .cs-readhead{display:flex;align-items:center;gap:10px;margin:0 0 8px}
  .cs-readtitle{min-width:0;font-size:13px;font-weight:700;color:#0f172a;line-height:1.35}
  .cs-body{max-height:55vh;overflow-y:auto;border-top:1px solid #E2E8F0;padding-top:8px;font-size:13px;line-height:1.55;color:#334155;overflow-wrap:anywhere}
  .cs-body.cs-bad{color:#B91C1C}
  .cs-h1{font-size:14px;font-weight:800;margin:14px 0 4px;color:#0f172a}
  .cs-h2{font-size:13px;font-weight:700;margin:10px 0 3px;color:#0f172a}
  .cs-p{margin:0 0 9px;font-size:13px;line-height:1.55;color:#334155}
  .cs-li{margin:0 0 5px 10px;font-size:13px;line-height:1.5;color:#334155}
  .cs-lines{white-space:pre-line;margin:0 0 9px}
  button:disabled{opacity:.5;cursor:default}
</style>
</head>
<body>
<div class="card">
  ${BRAND_HEADER}
  <div id="step-phone" class="step active">
    <h1>Activate this VakilCard</h1>
    <p>Enter your phone number to link this card to your account. If you don't have one yet, this creates your VakilCard and your Vakilpedia account &mdash; used to sign in across CaseLinx, CourtQue and other Vakilpedia apps. After you verify your number you will be shown the Vakilpedia Terms, the Privacy Notice and the VakilCard agreement to read and accept.</p>
    <input id="phone" type="tel" inputmode="tel" placeholder="10-digit mobile number" autocomplete="tel">
    <div class="err" id="err-phone"></div>
    <button id="btn-send">Send code</button>
  </div>
  <div id="step-otp" class="step">
    <h1>Enter the code</h1>
    <p>We sent a 6-digit code on WhatsApp to <span id="phone-echo"></span>.</p>
    <input id="otp" type="tel" inputmode="numeric" maxlength="6" placeholder="6-digit code" autocomplete="one-time-code">
    <div class="err" id="err-otp"></div>
    <button id="btn-verify">Verify &amp; activate</button>
    <button id="btn-resend" type="button" disabled
            style="background:#fff;color:#635BFF;border:1.5px solid #CBD5E1;margin-top:10px">Resend code</button>
    <p id="resend-note" style="margin:8px 0 0;font-size:12px;color:#64748B;text-align:center">
      Didn&rsquo;t get it? You can resend in <span id="resend-count">60</span>s.
    </p>
  </div>
  <div id="step-consent" class="step">
    <div id="consent-root"></div>
  </div>
  <div id="step-done" class="step">
    <h1>VakilCard activated 🎉</h1>
    <p id="done-msg">Setting things up…</p>
    <div id="courtque-offer" style="display:none;margin-top:6px;padding-top:18px;border-top:1px solid #E2E8F0">
      <p style="font-weight:800;color:#0f172a;margin:0 0 6px">Try CourtQue free</p>
      <p>Get a WhatsApp alert the moment your case is coming up at MPHC &mdash; 10 alerts a day, free during our beta. You will be shown the CourtQue agreement to read and accept first.</p>
      <div class="err" id="err-courtque"></div>
      <button id="btn-courtque" type="button">Try CourtQue free</button>
      <button id="btn-continue" type="button" style="background:#fff;color:#635BFF;border:1.5px solid #635BFF;margin-top:10px">Continue to my VakilCard</button>
    </div>
  </div>
</div>
<script>
(function(){
  var CODE = ${jsStr(code)};
  var DASHBOARD_FALLBACK = ${jsStr(DASHBOARD_SITE)};
  var COURTQUE_WA = ${jsStr(COURTQUE_WHATSAPP_URL)};
  var phone = "";
  var authState = null; // tokens from the OTP verify
  var dest = null;      // where "Continue to my VakilCard" goes
  function show(id){ document.querySelectorAll(".step").forEach(function(s){ s.classList.remove("active"); }); document.getElementById(id).classList.add("active"); }
  function setErr(id, msg){ document.getElementById(id).textContent = msg || ""; }

  // The consent card (see api/vakilcard/_consentClient.js). Nothing is recorded, and no card is
  // bound, until the person has accepted what is listed there for real (or nothing is owed).
  var consent = ${consentClientSource({ accountOrigin: ACCOUNT_ORIGIN })};

  // ── Resend cooldown (2026-08-16) ───────────────────────────────────────────
  // WhatsApp delivery is not instant and a lawyer standing at a stall has no way
  // to ask for another code without this. 60s, restarted on every send, so the
  // button cannot be used to hammer the OTP sender — the server has its own
  // cooldown/rate limit too; this is the visible half of it.
  var RESEND_SECONDS = 60;
  var resendTimer = null;
  function startResendCooldown(){
    var left = RESEND_SECONDS;
    var btn = document.getElementById("btn-resend");
    var note = document.getElementById("resend-note");
    var count = document.getElementById("resend-count");
    btn.disabled = true;
    note.style.display = "block";
    count.textContent = String(left);
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(function(){
      left -= 1;
      if (left <= 0) {
        clearInterval(resendTimer); resendTimer = null;
        btn.disabled = false;
        note.style.display = "none";
        return;
      }
      count.textContent = String(left);
    }, 1000);
  }

  document.getElementById("btn-resend").addEventListener("click", function(){
    setErr("err-otp", "");
    if (!phone) { setErr("err-otp", "Go back and enter your number again."); return; }
    var btn = this; btn.disabled = true; btn.textContent = "Sending…";
    fetch("/api/vakilcard/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resend", phone: phone }) })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
      .then(function(res){
        btn.textContent = "Resend code";
        if (!res.ok) {
          // Server said no (its own cooldown / hourly cap). Re-arm the timer anyway
          // so the button cannot be tapped repeatedly into a hard rate limit.
          setErr("err-otp", res.d && (res.d.error === "rate_limited" || res.d.error === "cooldown")
            ? "Please wait a moment before asking for another code."
            : "Couldn't resend just now. Try again shortly.");
          startResendCooldown();
          return;
        }
        document.getElementById("otp").value = "";
        startResendCooldown();
      })
      .catch(function(){ btn.textContent = "Resend code"; setErr("err-otp", "Network error, try again."); startResendCooldown(); });
  });

  document.getElementById("btn-send").addEventListener("click", function(){
    setErr("err-phone", "");
    phone = document.getElementById("phone").value.trim();
    if (!phone) { setErr("err-phone", "Enter your phone number."); return; }
    var btn = this; btn.disabled = true; btn.textContent = "Sending…";
    fetch("/api/vakilcard/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", phone: phone }) })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
      .then(function(res){
        btn.disabled = false; btn.textContent = "Send code";
        if (!res.ok) { setErr("err-phone", res.d.error === "rate_limited" || res.d.error === "cooldown" ? "Too many attempts, try again shortly." : "Couldn't send the code. Check the number."); return; }
        document.getElementById("phone-echo").textContent = phone;
        show("step-otp");
        startResendCooldown();
      })
      .catch(function(){ btn.disabled = false; btn.textContent = "Send code"; setErr("err-phone", "Network error, try again."); });
  });

  document.getElementById("btn-verify").addEventListener("click", function(){
    setErr("err-otp", "");
    var code = document.getElementById("otp").value.trim();
    if (!code) { setErr("err-otp", "Enter the code."); return; }
    var btn = this; btn.disabled = true; btn.textContent = "Verifying…";
    // Also lock the resend button for the duration of this verify call (2026-08-17
    // kiosk fix). CaseLinx's bridge can take up to 25s (see auth.js), and if the
    // user gets impatient and taps "Resend" mid-verify, a SECOND pending session is
    // created for the same phone — both VakilCard's local verify and CaseLinx's
    // otpService then match against the NEWEST pending session only, so the
    // original (correct) code the user typed gets rejected against the new one.
    // Freezing resend here doesn't remove that race at the data layer, but it
    // closes the one window a real kiosk user could hit it through the UI.
    var resendBtn = document.getElementById("btn-resend");
    var resendWasDisabled = resendBtn.disabled;
    resendBtn.disabled = true;
    fetch("/api/vakilcard/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", phone: phone, code: code }) })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
      .then(function(res){
        if (!res.ok) {
          btn.disabled = false; btn.textContent = "Verify & activate";
          if (!resendWasDisabled) resendBtn.disabled = false;
          // A brand-new person whose account is still in the approval queue gets the server's own words.
          setErr("err-otp", res.d && res.d.error === "awaiting_approval" && res.d.message ? res.d.message : "Incorrect or expired code.");
          return;
        }
        authState = res.d;
        // Consent BEFORE the card is bound. The card lists every agreement still owed; if nothing is
        // owed it hands straight on. If the account is awaiting approval it says so and stops.
        consent.start({
          token: res.d.access_token,
          product: "vakilcard",
          show: function(){ show("step-consent"); },
          onDone: function(ctx){ bindCard(res.d, ctx); }
        });
      })
      .catch(function(){ btn.disabled = false; btn.textContent = "Verify & activate"; if (!resendWasDisabled) resendBtn.disabled = false; setErr("err-otp", "Network error, try again."); });
  });

  function bindCard(auth, ctx){
    ctx.busy("Linking your card…");
    fetch("/api/vakilcard/nfc", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + auth.access_token }, body: JSON.stringify({ action: "bind", code: CODE }) })
      .then(function(r2){ return r2.json().then(function(d2){ return { ok: r2.ok, d: d2 }; }); })
      .then(function(bindRes){
        if (!bindRes.ok) {
          var claimed = bindRes.d && bindRes.d.error === "already_claimed";
          ctx.fail(claimed ? "This card is already linked to another account." : "Couldn't activate this card. Contact support.", claimed ? null : function(){ bindCard(auth, ctx); });
          return;
        }
        if (bindRes.d.published && bindRes.d.redirect) {
          // Published card: the public URL needs no session, land there directly.
          dest = bindRes.d.redirect;
        } else {
          // Not published yet: this browser JUST proved phone ownership via the
          // OTP above, and already holds the freshly-issued tokens (auth) —
          // carry them into the dashboard via a URL FRAGMENT (never sent to the
          // server, never logged) instead of bouncing to an unauthenticated
          // dashboard root, which previously dead-ended on the marketing page.
          // See App.js's fragment-token bootstrap. (2026-08-15 kiosk fix.)
          dest = DASHBOARD_FALLBACK + "/setup#at=" + encodeURIComponent(auth.access_token) + "&rt=" + encodeURIComponent(auth.refresh_token);
        }
        document.getElementById("done-msg").textContent = "Your VakilCard is ready.";
        document.getElementById("courtque-offer").style.display = "block";
        show("step-done");
      })
      .catch(function(){ ctx.fail("Network error while linking your card.", function(){ bindCard(auth, ctx); }); });
  }

  document.getElementById("btn-continue").addEventListener("click", function(){
    if (dest) window.location.href = dest;
  });

  // CourtQue offer: same card, for the CourtQue agreement, then redeem. An OPTIONAL offer, so the
  // card has "Not now" (back to this screen) instead of the delete-my-account link.
  document.getElementById("btn-courtque").addEventListener("click", function(){
    if (!authState) return;
    setErr("err-courtque", "");
    consent.start({
      token: authState.access_token,
      product: "courtque",
      heading: "Before you try CourtQue",
      optional: true,
      show: function(){ show("step-consent"); },
      onBack: function(){ show("step-done"); },
      onDone: function(ctx){ redeemCourtque(ctx); }
    });
  });

  function redeemCourtque(ctx){
    ctx.busy("Activating CourtQue…");
    var cqBtn = document.getElementById("btn-courtque");
    fetch("/api/vakilcard/auth", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + authState.access_token }, body: JSON.stringify({ action: "redeem_courtque_beta" }) })
      .then(function(r3){ return r3.json().then(function(d3){ return { ok: r3.ok, d: d3 }; }); })
      .then(function(cqRes){
        if (!cqRes.ok || !cqRes.d.ok) {
          var code = cqRes.d && cqRes.d.error;
          var terminal = code === "exhausted" || code === "invalid_code";
          var msg = code === "exhausted" ? "This beta offer is fully claimed — sorry!" : code === "invalid_code" ? "This offer isn't available right now." : "Couldn't activate CourtQue" + (code ? " (" + code + ")" : "") + ".";
          ctx.fail(msg, terminal ? null : function(){ redeemCourtque(ctx); });
          return;
        }
        show("step-done");
        cqBtn.disabled = true; cqBtn.textContent = "CourtQue activated ✓";
        if (COURTQUE_WA) {
          window.location.href = COURTQUE_WA;
        } else {
          setErr("err-courtque", "");
          document.getElementById("done-msg").textContent = "CourtQue activated — we'll message you on WhatsApp with next steps.";
        }
      })
      .catch(function(){ ctx.fail("Network error while activating CourtQue.", function(){ redeemCourtque(ctx); }); });
  }
})();
</script>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const code = String(req.query.code || "").toLowerCase();
    if (!CODE_RE.test(code)) return errorPage(res, 404, "Card not found", "This link isn't a valid VakilCard NFC card.");
    try {
      const card = await loadCard(code);
      if (!card) return errorPage(res, 404, "Card not found", "This card isn't registered yet. Contact Vakilpedia support if you believe this is a mistake.");
      if (card.status === "revoked") return errorPage(res, 410, "Card deactivated", "This card has been deactivated. Contact Vakilpedia support for a replacement.");
      if (card.status === "bound" && card.account_id) {
        const profile = await profileForAccount(card.account_id);
        if (profile) {
          // Fire-and-forget: this is the one place a real physical tap is
          // distinguishable from a QR scan or a typed-in URL — record it
          // before redirecting so a slow/failed insert never delays the tap.
          trackEvent(profile.id, "nfc_tap", null).catch(() => {});
          res.statusCode = 302; // not cached long-lived: a rebind must take effect immediately
          // Always the public-card URL, published or not — a re-tap of a
          // still-draft card has no fresh auth proof to carry (this is a
          // bare GET, no OTP just happened), so it must NOT land on the
          // dashboard root unauthenticated (that dead-ended on VakilCard's
          // marketing page — 2026-08-15). profile.js itself now renders a
          // "finish setting up" OTP prompt for the unpublished case instead
          // of a dead end, so this single destination is correct either way.
          res.setHeader("Location", `${SITE}/${profile.username}`);
          res.setHeader("Cache-Control", "no-store");
          res.end();
          return;
        }
        // Bound but the profile is gone (deleted account) — fall through to
        // re-activation rather than dead-ending the customer.
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(claimPage(code));
    } catch (e) {
      return errorPage(res, 500, "Temporarily unavailable", "Please try again in a moment.");
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const who = await resolveAccount(req);
      if (!who || !who.accountId) return json(res, 401, { error: "unauthenticated" });
      const body = await readJsonBody(req);
      if (body.action !== "bind") return json(res, 400, { error: "unknown_action" });
      const code = String(body.code || "").toLowerCase();
      if (!CODE_RE.test(code)) return json(res, 400, { error: "invalid_code" });

      const card = await loadCard(code);
      if (!card) return json(res, 404, { error: "not_found" });
      if (card.status === "revoked") return json(res, 410, { error: "revoked" });
      if (card.status === "bound") {
        if (card.account_id === who.accountId) {
          const profile = await profileForAccount(who.accountId);
          return json(res, 200, {
            ok: true,
            published: !!(profile && profile.is_published),
            redirect: profile ? `${SITE}/${profile.username}` : DASHBOARD_SITE,
          });
        }
        return json(res, 409, { error: "already_claimed" });
      }

      await db(`vakilcard_physical_cards?code=eq.${encodeURIComponent(code)}`, {
        method: "PATCH",
        body: { account_id: who.accountId, status: "bound", claimed_at: new Date().toISOString() },
        prefer: "return=minimal",
      });

      const profile = await profileForAccount(who.accountId);
      return json(res, 200, {
        ok: true,
        published: !!(profile && profile.is_published),
        redirect: profile ? `${SITE}/${profile.username}` : DASHBOARD_SITE,
      });
    } catch (e) {
      return json(res, 500, { error: "server_error" });
    }
  }

  return json(res, 405, { error: "method_not_allowed" });
};
