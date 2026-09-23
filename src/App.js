import React, { Suspense, lazy, useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { setTokens, hasPhoneSession } from "./lib/vakilcardApi";
import SuiteInvite from "./components/SuiteInvite";
import ThemeSync from "./components/ThemeSync";
import ThemeCornerToggle from "./components/ThemeCornerToggle";
import AddToHomeScreen from './components/AddToHomeScreen';

// Bridge tokens minted just-in-time by the NFC claim flow (api/vakilcard/nfc.js's
// claimPage) into this SPA's own session store. The claim page is a standalone
// (non-React) page that just proved phone ownership via OTP — it hands the
// freshly-issued tokens forward as a URL FRAGMENT (never sent to the server,
// never logged) rather than bouncing here unauthenticated, which previously
// dead-ended on this app's own marketing/login screen. 2026-08-15 kiosk fix.
function useFragmentTokenBridge() {
  useEffect(() => {
    const hash = window.location.hash || "";
    if (hash.indexOf("at=") === -1) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const access_token = params.get("at");
    const refresh_token = params.get("rt");
    if (access_token && refresh_token) {
      setTokens({ access_token, refresh_token });
      // Strip the fragment immediately — tokens must not linger in browser
      // history/the visible URL bar any longer than one paint.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);
}

// Silent "one sign-in, all apps" bridge (2026-08-15, P0). Suite/CaseLinx's
// Supabase session cookie is Domain=".vakilpedia.com" (see
// Apps/Suite/src/lib/supabase/middleware.ts), so it's already sitting in the
// browser on this page load too — VakilCard just has to notice and ask its
// backend to trade it for a VakilCard session (api/vakilcard/auth.js's
// "bridge_from_suite" action). Only fires when there's no existing VakilCard
// session and no NFC-claim fragment just arrived (that bridge — above — is
// the more specific, already-verified case and always wins). Best-effort and
// silent: on any failure or "no match found" this is a pure no-op, the app
// just renders its normal signed-out state as before.
function useSuiteSessionBridge() {
  // When the bridge finds a live Vakilpedia session with NO VakilCard
  // account behind it, it now says so and hands back who that person is.
  // Rendering their own name and a single button beats VakilCard's signup
  // screen asking for a WhatsApp OTP the platform has already paid for.
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    if (hasPhoneSession()) return;
    if ((window.location.hash || "").indexOf("at=") !== -1) return;

    // 2026-09-15 outage fix: this bridge used to reload unconditionally
    // every time it found a Suite session, with no memory of having tried
    // before. For any visitor whose freshly-set tokens don't survive the
    // reload (session never confirmed authed on the next mount), that ran
    // forever — reload, hasPhoneSession() false again, fetch, reload — and
    // the page never finished loading. One attempt per tab, tracked in
    // sessionStorage (cleared on the next real tab open, so a later visit
    // still gets exactly one silent-bridge try): if it already tried and
    // the session still isn't there, fall through to the normal signed-out
    // page instead of spinning. See vakilpedia_vakilcard_auth_bridge_reload_loop
    // memory for the investigation.
    let alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem("vc_suite_bridge_tried") === "1";
    } catch {
      /* sessionStorage unavailable (private mode, etc.) — behave as before */
    }
    if (alreadyTried) return;

    fetch("/api/vakilcard/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "bridge_from_suite" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.found && data.access_token && data.refresh_token) {
          setTokens(data);
          try {
            sessionStorage.setItem("vc_suite_bridge_tried", "1");
          } catch {
            /* best-effort guard only */
          }
          // Everything already mounted assumed signed-out; reload once so the
          // whole app picks up the new session exactly like a normal
          // already-signed-in page load would.
          window.location.reload();
          return;
        }
        if (data && data.invite && data.invite.email) setInvite(data.invite);
      })
      .catch(() => {});
  }, []);

  return invite;
}

// Cut over 2026-08-04: this app is now its own deployment on
// vakilcard.vakilpedia.com, so routes no longer carry a "/vakilcard" path
// prefix — the subdomain itself is that namespace. The public card
// (www.vakilpedia.com/:username, server-rendered by api/vakilcard/profile.js)
// stays on the root marketing domain and is unaffected by anything here.
const VakilCardPage = lazy(() => import("./pages/VakilCardPage"));
const VakilCardSetup = lazy(() => import("./pages/vakilcard/SetupWizard"));
const VakilCardAdmin = lazy(() => import("./pages/vakilcard/AdminPage"));

function Loading() {
  return <div style={{ padding: 40, textAlign: "center", color: "var(--vc-ink-muted)" }}>Loading…</div>;
}

function App() {
  useFragmentTokenBridge();
  const suiteInvite = useSuiteSessionBridge();
  return (
    <div className="App">
      <ThemeSync />
      {suiteInvite && <SuiteInvite invite={suiteInvite} />}
      <BrowserRouter>
        <Routes>
          {/* single public entry point on this subdomain */}
          <Route path="/" element={<Suspense fallback={<Loading />}><VakilCardPage /></Suspense>} />
          {/* Owner dashboard lives at a per-username URL. VakilCardPage
              canonicalises / -> /:username/dashboard once the owner is
              known, and redirects a mismatched username to the owner's
              own dashboard. */}
          <Route path="/:username/dashboard" element={<Suspense fallback={<Loading />}><VakilCardPage /></Suspense>} />
          {/* /signup is the PUBLIC front door into VakilCard's own WhatsApp-OTP
              signup, and it renders that flow whatever the session state.
              It used to redirect to "/" forever; that stopped being safe on
              2026-09-12, when the root started sending signed-out visitors to
              the marketing page at www.vakilpedia.com/vakilcard. Every
              "Create your VakilCard" button on that page points here, and if
              this still redirected to "/" the visitor would be sent back to
              www and bounce between the two with no way to sign up at all.
              Same component as "/", so a signed-in owner who lands here still
              gets their dashboard. */}
          <Route path="/signup" element={<Suspense fallback={<Loading />}><VakilCardPage /></Suspense>} />
          {/* /setup and /admin render no SiteNav, so they get the standalone corner
              switch (mounted here so it covers every state of both pages,
              including loading / error / "not authorized"). Every other route
              already carries the switch inside SiteNav. */}
          <Route path="/setup" element={<><ThemeCornerToggle /><Suspense fallback={<Loading />}><VakilCardSetup /></Suspense></>} />
          {/* Founder-only — api/vakilcard/admin.js is the real gate, this
              route just lazy-loads the dashboard shell. */}
          <Route path="/admin" element={<><ThemeCornerToggle /><Suspense fallback={<Loading />}><VakilCardAdmin /></Suspense></>} />
        </Routes>
      </BrowserRouter>
      <AddToHomeScreen appName="VakilCard" />
    </div>
  );
}

export default App;
