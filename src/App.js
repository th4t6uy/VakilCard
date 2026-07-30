import React, { Suspense, lazy } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Routes and paths below are copied verbatim from
// Apps/Vakilpedia-website/frontend/src/App.js's VakilCard section — same
// public URLs, same redirect behaviour. This app is not yet independently
// deployed; production traffic still flows through Vakilpedia-website until
// a separate deployment-cutover step (see Apps/VakilCard/README.md).
const VakilCardPage = lazy(() => import("./pages/VakilCardPage"));
const VakilCardSetup = lazy(() => import("./pages/vakilcard/SetupWizard"));
const VakilCardAdmin = lazy(() => import("./pages/vakilcard/AdminPage"));

function Loading() {
  return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading…</div>;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          {/* Convenience only for standalone dev/preview — production's "/"
              is still Vakilpedia-website's marketing Home until cutover. */}
          <Route path="/" element={<Navigate to="/vakilcard" replace />} />

          <Route path="/vakilcard" element={<Suspense fallback={<Loading />}><VakilCardPage /></Suspense>} />
          {/* Owner dashboard lives at a per-username URL. VakilCardPage
              canonicalises /vakilcard -> /vakilcard/:username/dashboard once
              the owner is known, and redirects a mismatched username to the
              owner's own dashboard. */}
          <Route path="/vakilcard/:username/dashboard" element={<Suspense fallback={<Loading />}><VakilCardPage /></Suspense>} />
          {/* single public entry point — the old signup URL redirects forever */}
          <Route path="/vakilcard/signup" element={<Navigate to="/vakilcard" replace />} />
          <Route path="/vakilcard/setup" element={<Suspense fallback={<Loading />}><VakilCardSetup /></Suspense>} />
          {/* Founder-only — api/vakilcard/admin.js is the real gate, this
              route just lazy-loads the dashboard shell. */}
          <Route path="/vakilcard/admin" element={<Suspense fallback={<Loading />}><VakilCardAdmin /></Suspense>} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
