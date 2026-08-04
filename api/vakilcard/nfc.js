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
// Design note: the tag itself is written+locked once, at manufacturing time,
// with this opaque code and nothing else. Nothing here ever touches the
// physical chip again — "reassigning" a card is only ever this table.
const { db, esc, jsStr, readJsonBody, resolveAccount, trackEvent } = require("./_lib");

// Owner dashboard's own domain (cut over 2026-08-04) — see auth.js/profile.js.
// (The public card itself stays on the root marketing domain — see SITE in
// profile.js/auth.js — nfc.js never needs that constant since every
// redirect here targets either a relative /:username or the dashboard.)
const DASHBOARD_SITE = process.env.VAKILCARD_DASHBOARD_URL || "https://vakilcard.vakilpedia.com";
const CODE_RE = /^[a-z0-9]{6,16}$/;

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
</style>
</head>
<body>
<div class="card">
  ${BRAND_HEADER}
  <div id="step-phone" class="step active">
    <h1>Activate this VakilCard</h1>
    <p>Enter your phone number to link this card to your account. If you don't have a VakilCard yet, this creates one.</p>
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
  </div>
  <div id="step-done" class="step">
    <h1>Activated 🎉</h1>
    <p>Redirecting to your VakilCard…</p>
  </div>
</div>
<script>
(function(){
  var CODE = ${jsStr(code)};
  var DASHBOARD_FALLBACK = ${jsStr(DASHBOARD_SITE)};
  var phone = "";
  function show(id){ document.querySelectorAll(".step").forEach(function(s){ s.classList.remove("active"); }); document.getElementById(id).classList.add("active"); }
  function setErr(id, msg){ document.getElementById(id).textContent = msg || ""; }

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
      })
      .catch(function(){ btn.disabled = false; btn.textContent = "Send code"; setErr("err-phone", "Network error, try again."); });
  });

  document.getElementById("btn-verify").addEventListener("click", function(){
    setErr("err-otp", "");
    var code = document.getElementById("otp").value.trim();
    if (!code) { setErr("err-otp", "Enter the code."); return; }
    var btn = this; btn.disabled = true; btn.textContent = "Verifying…";
    fetch("/api/vakilcard/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", phone: phone, code: code }) })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
      .then(function(res){
        if (!res.ok) { btn.disabled = false; btn.textContent = "Verify & activate"; setErr("err-otp", "Incorrect or expired code."); return; }
        return fetch("/api/vakilcard/nfc", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + res.d.access_token }, body: JSON.stringify({ action: "bind", code: CODE }) })
          .then(function(r2){ return r2.json().then(function(d2){ return { ok: r2.ok, d: d2, auth: res.d }; }); })
          .then(function(bindRes){
            if (!bindRes.ok) { btn.disabled = false; btn.textContent = "Verify & activate"; setErr("err-otp", bindRes.d.error === "already_claimed" ? "This card is already linked to another account." : "Couldn't activate this card. Contact support."); return; }
            show("step-done");
            var dest = bindRes.d.redirect || bindRes.auth.card_url || bindRes.auth.setup_url || DASHBOARD_FALLBACK;
            setTimeout(function(){ window.location.href = dest; }, 900);
          });
      })
      .catch(function(){ btn.disabled = false; btn.textContent = "Verify & activate"; setErr("err-otp", "Network error, try again."); });
  });
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
          res.setHeader("Location", profile.is_published ? `/${profile.username}` : DASHBOARD_SITE);
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
          return json(res, 200, { ok: true, redirect: profile && profile.is_published ? `/${profile.username}` : DASHBOARD_SITE });
        }
        return json(res, 409, { error: "already_claimed" });
      }

      await db(`vakilcard_physical_cards?code=eq.${encodeURIComponent(code)}`, {
        method: "PATCH",
        body: { account_id: who.accountId, status: "bound", claimed_at: new Date().toISOString() },
        prefer: "return=minimal",
      });

      const profile = await profileForAccount(who.accountId);
      return json(res, 200, { ok: true, redirect: profile && profile.is_published ? `/${profile.username}` : DASHBOARD_SITE });
    } catch (e) {
      return json(res, 500, { error: "server_error" });
    }
  }

  return json(res, 405, { error: "method_not_allowed" });
};
