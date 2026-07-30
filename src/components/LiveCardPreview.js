// Live, keystroke-reactive preview of the REAL VakilCard.
// Renders the production Design System component (window.VakilCardApp from
// the prebuilt /ds/* bundle — the exact code public cards run) inside an
// iframe and re-renders it via postMessage whenever the form state changes.
// No mockup, no duplicated layout, no backend: static assets only, so it
// works identically on localhost, beta and production.
//
// The DS card is authored at a FIXED 412px width (handoff viewport 412x760);
// it must never reflow. Like the signup DemoPhone, we render at native size
// and visually scale to the container.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { formToDsProfile } from "../lib/vakilcardNormalize";

const DS_W = 412;
const DS_H = 780;

// Interactions inside the preview are visual-only (same rule as demo mode).
const PREVIEW_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base href="/ds/ui_kits/vakilcard/">
<link rel="stylesheet" href="/ds/styles.css">
<link rel="stylesheet" href="/ds/page.css">
</head><body>
<div id="root"></div>
<script src="/ds/react.production.min.js"></script>
<script src="/ds/react-dom.production.min.js"></script>
<script src="/ds/_ds_bundle.js"></script>
<script src="/ds/ui_kits/vakilcard/VakilCardApp.js"></script>
<script>
(function () {
  var root = ReactDOM.createRoot(document.getElementById("root"));
  var render = function (profile) {
    root.render(React.createElement(window.VakilCardApp, { profile: profile }));
  };
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.type === "vc-profile" && d.profile) render(d.profile);
    if (d.type === "vc-theme" && d.theme) document.documentElement.dataset.theme = d.theme;
  });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (a) e.preventDefault(); // visual-only — no navigation ever
  }, true);
  parent.postMessage({ type: "vc-preview-ready" }, "*");
})();
</script></body></html>`;

/**
 * form: the wizard/dashboard form state (profileToForm shape).
 * theme: "light" | "dark" (DS is dark-first; defaults dark like live cards).
 */
export default function LiveCardPreview({ form, theme = "dark", className = "" }) {
  const frameRef = useRef(null);
  const shellRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(1);

  const dsProfile = useMemo(() => formToDsProfile(form || {}), [form]);

  useEffect(() => {
    const measure = () => {
      if (shellRef.current) {
        const w = shellRef.current.clientWidth;
        if (w > 0) setScale(w / DS_W);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Handshake: the iframe announces readiness, then receives every update.
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data && e.data.type === "vc-preview-ready") setReady(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (!ready || !frameRef.current) return;
    const w = frameRef.current.contentWindow;
    if (!w) return;
    w.postMessage({ type: "vc-theme", theme }, "*");
    w.postMessage({ type: "vc-profile", profile: dsProfile }, "*");
  }, [ready, dsProfile, theme]);

  return (
    <div className={className}>
      <div
        ref={shellRef}
        className="relative overflow-hidden rounded-[2rem] border border-slate-200/70 shadow-lg"
        style={{ background: "#050508", height: Math.round(DS_H * scale) }}
      >
        <iframe
          ref={frameRef}
          title="Live VakilCard preview"
          srcDoc={PREVIEW_HTML}
          className="block"
          style={{
            width: DS_W,
            height: DS_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            border: 0,
            background: "#050508",
          }}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
            <p className="text-xs font-bold text-slate-400">Loading your card…</p>
          </div>
        )}
      </div>
      <p className="text-center text-[11px] font-bold text-slate-400 mt-2">
        Live preview — updates as you type
      </p>
    </div>
  );
}
