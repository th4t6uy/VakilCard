import React, { Suspense, lazy, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { setTokens, hasPhoneSession } from "./lib/vakilcardApi";

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
  useEffect(() => {
    if (hasPhoneSession()) return;
    if ((window.location.hash || "").indexOf("at=") !== -1) return;
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
          // Everything already mounted assumed signed-out; reload once so the
          // whole app picks up the new session exactly like a normal
          // already-signed-in page load would.
          window.location.reload();
        }
      })
      .catch(() => {});
  }, []);
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
  return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading…</div>;
}

function App() {
  useFragmentTokenBridge();
  useSuiteSessionBridge();
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          {/* single public entry point on this subdomain */}
          <Route path="/" element={<Suspense fallback={<Loading />}><VakilCardPage /></Suspense>} />
          {/* Owner dashboard lives at a per-username URL. VakilCardPage
              canonicalises / -> /:username/dashboard once the owner is
              known, and redirects a mismatched username to the owner's
              own dashboard. */}
          <Route path="/:username/dashboard" element={<Suspense fallback={<Loading />}><VakilCardPage /></Suspense>} />
          {/* legacy signup URL redirects forever */}
          <Route path="/signup" element={<Navigate to="/" replace />} />
          <Route path="/setup" element={<Suspense fallback={<Loading />}><VakilCardSetup /></Suspense>} />
          {/* Founder-only — api/vakilcard/admin.js is the real gate, this
              route just lazy-loads the dashboard shell. */}
          <Route path="/admin" element={<Suspense fallback={<Loading />}><VakilCardAdmin /></Suspense>} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
