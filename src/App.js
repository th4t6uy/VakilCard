import React, { Suspense, lazy, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { setTokens } from "./lib/vakilcardApi";

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
