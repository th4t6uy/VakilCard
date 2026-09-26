import { useEffect, useState } from "react";

/* The admin panel's per-app switches, shown inside VakilCard (2026-09-26).
 *
 * admin.vakilpedia.com -> Apps -> VakilCard -> Controls saves a maintenance message and a notice.
 * The answer comes from POST /api/vakilcard/auth {action:"controls"} (one small public call, cached
 * a minute at the edge). FAIL OPEN: if anything goes wrong nothing is shown -- a control outage
 * must never put a stray banner or an error on someone's card.
 *
 * LAYOUT RULE (founder: never make a page scroll longer). The strip is FIXED to the bottom edge,
 * above the phone safe area, so it adds no height to any page. A notice can be dismissed for the
 * session; maintenance cannot (it is a status, not a message). */

const LEVEL = {
  info: "bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-500/15 dark:border-sky-500/40 dark:text-sky-200",
  warning: "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-200",
  critical: "bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-500/15 dark:border-rose-500/40 dark:text-rose-200",
};

const MAINTENANCE_DEFAULT = "We're doing some maintenance. Some things may be slow or briefly unavailable.";

export function useProductControls() {
  const [controls, setControls] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/vakilcard/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "controls" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && d.controls) setControls(d.controls); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return controls;
}

export default function ProductControlsBanner() {
  const controls = useProductControls();
  const notice = controls && controls.notice;
  const key = notice ? `vp-notice-dismissed:vakilcard:${notice.title || ""}:${String(notice.body).slice(0, 40)}` : "";
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!key) return;
    try { setDismissed(window.sessionStorage.getItem(key) === "1"); } catch { /* storage unavailable: just show it */ }
  }, [key]);

  const showNotice = Boolean(notice) && !dismissed;
  if (!controls || (!controls.maintenance && !showNotice)) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-3"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      {controls.maintenance && (
        <div className={`pointer-events-auto w-full max-w-xl rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg ${LEVEL.warning}`}>
          {controls.maintenanceMessage || MAINTENANCE_DEFAULT}
        </div>
      )}
      {showNotice && (
        <div className={`pointer-events-auto flex w-full max-w-xl items-start gap-2 rounded-xl border px-3 py-2 text-xs shadow-lg ${LEVEL[notice.level] || LEVEL.info}`}>
          <div className="min-w-0 flex-1">
            {notice.title && <div className="font-bold">{notice.title}</div>}
            <div className="max-h-24 overflow-y-auto whitespace-pre-line">{notice.body}</div>
          </div>
          <button
            type="button"
            aria-label="Dismiss notice"
            className="shrink-0 rounded px-1 text-base leading-none hover:bg-black/10"
            onClick={() => {
              setDismissed(true);
              try { window.sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
