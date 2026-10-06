"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, Coins, ExternalLink, Plus, User, X } from "lucide-react";
/**
 * The credit balance pill for the navigation bar (founder, 5 Oct 2026).
 *
 * "The button that shows the balance is also used for purchasing": ONE pill
 * that shows the signed-in person's V1 credit balance, with an orange "+"
 * badge so it reads as a button. Tapping it opens the ONE platform payment page
 * (Account's credits checkout) in place, in a window over the app; when the
 * payment page reports success the balance refreshes on its own.
 *
 * Same file in every app that wears the Vakilpedia nav (Account, Affidavit
 * Maker, SignLinx, CourtQue, BareLex; a JS twin on www and VakilCard). The
 * balance comes from one endpoint, account.vakilpedia.com/api/credits/balance,
 * read with the shared .vakilpedia.com session cookie. Signed out, or the
 * balance cannot be read: the pill does not render at all.
 *
 * 6 Oct 2026: a person who belongs to a firm also gets a small chip beside the pill to choose which balance their
 * charges come out of -- Personal or the Firm's. The pill then shows THAT balance. Everyone else sees no chip.
 *
 * Any app can ask the pill to re-read the balance after it charges credits:
 *   window.dispatchEvent(new Event("vakilpedia:credits-changed"))
 */
const ACCOUNT_ORIGIN = "https://account.vakilpedia.com";
export const CREDITS_CHANGED_EVENT = "vakilpedia:credits-changed";
const CREDIT_ORANGE = "#F97316";
function formatBalance(n) {
    if (n >= 100000)
        return `${Math.floor(n / 1000)}k`;
    if (n >= 10000)
        return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function checkoutUrl(source, embed) {
    const p = new URLSearchParams({ credits: "1" });
    if (embed)
        p.set("embed", "1");
    if (source)
        p.set("source", source);
    if (typeof window !== "undefined")
        p.set("next", window.location.href);
    return `${ACCOUNT_ORIGIN}/checkout?${p.toString()}`;
}
export function CreditsPill({ compact, source, sameOrigin, }) {
    const [balance, setBalance] = useState(null);
    const [spend, setSpend] = useState(null);
    const [open, setOpen] = useState(false);
    const load = useCallback(async () => {
        try {
            const r = await fetch(`${sameOrigin ? "" : ACCOUNT_ORIGIN}/api/credits/balance`, {
                credentials: "include",
                cache: "no-store",
            });
            const d = (await r.json());
            setBalance(d?.signedIn ? Number(d.balance ?? 0) : null);
            setSpend(d?.signedIn && d.spend && d.spend.firms?.length ? d.spend : null);
        }
        catch {
            setBalance(null);
            setSpend(null);
        }
    }, [sameOrigin]);
    useEffect(() => {
        load();
        const onFocus = () => { if (document.visibilityState === "visible")
            load(); };
        window.addEventListener(CREDITS_CHANGED_EVENT, load);
        document.addEventListener("visibilitychange", onFocus);
        return () => {
            window.removeEventListener(CREDITS_CHANGED_EVENT, load);
            document.removeEventListener("visibilitychange", onFocus);
        };
    }, [load]);
    if (balance === null)
        return null;
    const onClick = () => {
        if (sameOrigin) {
            window.location.href = checkoutUrl(source, false).replace(ACCOUNT_ORIGIN, "");
            return;
        }
        setOpen(true);
    };
    const fromFirm = spend?.from === "firm";
    const label = fromFirm ? "Firm credits" : "V1 credits";
    return (<>
      {spend ? <SpendChip spend={spend} compact={compact} sameOrigin={sameOrigin} onChanged={() => { load(); window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT)); }}/> : null}
      <button type="button" onClick={onClick} title={`${balance} ${label} · tap to add credits`} aria-label={`${label}: ${balance}. Add credits`} className={`inline-flex shrink-0 items-center rounded-full border bg-white/85 font-bold tabular-nums text-slate-800 transition-all hover:bg-white hover:scale-[1.03] dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/10 ${compact ? "h-8 gap-1 pl-2 pr-0.5 text-xs" : "h-10 gap-1.5 pl-3 pr-1 text-sm"}`} style={{ borderColor: "rgba(249,115,22,0.45)" }}>
        <Coins className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} style={{ color: CREDIT_ORANGE }} aria-hidden="true"/>
        <span>{formatBalance(balance)}</span>
        <span aria-hidden="true" className={`ml-0.5 flex items-center justify-center rounded-full text-white ${compact ? "h-6 w-6" : "h-8 w-8"}`} style={{ background: CREDIT_ORANGE }}>
          <Plus className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={3}/>
        </span>
      </button>
      {open ? (<CreditsWindow url={checkoutUrl(source, true)} onClose={(paid) => {
                setOpen(false);
                if (paid) {
                    load();
                    window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
                }
            }}/>) : null}
    </>);
}
/** Account's credits checkout in a window over the page. "New tab" keeps a bank page that refuses frames from being a dead end. */
function CreditsWindow({ url, onClose }) {
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e) => { if (e.key === "Escape")
            onClose(false); };
        const onMsg = (e) => {
            if (e.origin !== ACCOUNT_ORIGIN)
                return;
            const d = e.data;
            if (d?.type === "vakilpedia:payment")
                onClose(d.status === "success");
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("message", onMsg);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("message", onMsg);
        };
    }, [onClose]);
    return createPortal(<div role="dialog" aria-modal="true" aria-label="Add credits" onClick={() => onClose(false)} className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/55 p-2 sm:items-center">
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900" style={{ height: "min(88dvh, 760px)" }}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-white/10">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
            <Coins className="h-4 w-4" style={{ color: CREDIT_ORANGE }} aria-hidden="true"/> Add credits
          </span>
          <span className="inline-flex items-center gap-1">
            <a href={url.replace("embed=1&", "").replace("&embed=1", "")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-slate-600 no-underline hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
              New tab <ExternalLink className="h-3.5 w-3.5"/>
            </a>
            <button type="button" onClick={() => onClose(false)} aria-label="Close" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
              <X className="h-4 w-4"/>
            </button>
          </span>
        </div>
        <iframe title="Add credits" src={url} className="h-full w-full flex-1 border-0" allow="payment"/>
      </div>
    </div>, document.body);
}
/**
 * The Personal / Firm chip (6 Oct 2026). Tapping it opens a small menu: choose whose credits pay for what you do in the
 * Vakilpedia apps, and (Managers only) whether the team may spend the firm's credits. The database decides who is
 * allowed; this only asks. Changing the choice moves no credits.
 */
function SpendChip({ spend, compact, sameOrigin, onChanged }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const [pos, setPos] = useState(null);
    const btnRef = useRef(null);
    const fromFirm = spend.from === "firm";
    const firm = spend.firms.find((f) => f.workspaceId === spend.workspaceId) ?? spend.firms[0];
    useEffect(() => {
        if (!open)
            return;
        const place = () => {
            const r = btnRef.current?.getBoundingClientRect();
            if (!r)
                return;
            const w = Math.min(288, window.innerWidth - 16);
            setPos({ top: r.bottom + 6, left: Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8) });
        };
        place();
        const onKey = (e) => { if (e.key === "Escape")
            setOpen(false); };
        window.addEventListener("resize", place);
        window.addEventListener("keydown", onKey);
        return () => { window.removeEventListener("resize", place); window.removeEventListener("keydown", onKey); };
    }, [open]);
    async function post(body) {
        setBusy(true);
        setMsg(null);
        try {
            const r = await fetch(`${sameOrigin ? "" : ACCOUNT_ORIGIN}/api/credits/spend`, {
                method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            });
            const d = (await r.json().catch(() => null));
            if (!d?.ok) {
                setMsg(d?.error ?? "That did not go through.");
                return;
            }
            onChanged();
        }
        catch {
            setMsg("That did not go through.");
        }
        finally {
            setBusy(false);
        }
    }
    const row = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50";
    return (<>
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={fromFirm ? "Spending Firm credits · tap to change" : "Spending Personal credits · tap to change"} aria-label={fromFirm ? "Spending Firm credits. Change" : "Spending Personal credits. Change"} className={`mr-1 inline-flex shrink-0 items-center justify-center rounded-full border bg-white/85 text-slate-700 transition-all hover:bg-white dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/10 ${compact ? "h-8 w-8" : "h-10 w-10"}`} style={{ borderColor: fromFirm ? "rgba(249,115,22,0.45)" : "rgba(100,116,139,0.35)" }}>
        {fromFirm ? <Building2 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true"/> : <User className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true"/>}
      </button>
      {open && pos
            ? createPortal(<>
              <div className="fixed inset-0 z-[1000]" onClick={() => setOpen(false)} aria-hidden="true"/>
              <div role="menu" style={{ position: "fixed", top: pos.top, left: pos.left, width: Math.min(288, window.innerWidth - 16) }} className="z-[1001] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-slate-900">
                <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Spend credits from</div>
                <button type="button" role="menuitemradio" aria-checked={!fromFirm} disabled={busy} className={row} onClick={() => post({ from: "personal" })}>
                  <User className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true"/>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-900 dark:text-white">Personal</span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">{formatBalance(spend.personalBalance)}</span>
                  {!fromFirm ? <Check className="h-4 w-4 shrink-0" style={{ color: CREDIT_ORANGE }} aria-hidden="true"/> : <span className="h-4 w-4 shrink-0"/>}
                </button>
                {spend.firms.map((f) => (<button key={f.workspaceId} type="button" role="menuitemradio" aria-checked={fromFirm && spend.workspaceId === f.workspaceId} disabled={busy || !f.canSpend} className={row} onClick={() => post({ from: "firm", workspaceId: f.workspaceId })}>
                    <Building2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true"/>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900 dark:text-white">{f.name}</span>
                      {!f.canSpend ? <span className="block text-xs text-slate-500 dark:text-slate-400">Ask your Manager to allow this</span> : null}
                    </span>
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">{formatBalance(f.balance)}</span>
                    {fromFirm && spend.workspaceId === f.workspaceId ? <Check className="h-4 w-4 shrink-0" style={{ color: CREDIT_ORANGE }} aria-hidden="true"/> : <span className="h-4 w-4 shrink-0"/>}
                  </button>))}
                {firm?.isManager ? (<label className="mt-1 flex cursor-pointer items-start gap-2 border-t border-slate-200 px-2.5 pb-1.5 pt-2.5 text-xs text-slate-700 dark:border-white/10 dark:text-slate-300">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-orange-500" checked={firm.membersMaySpend} disabled={busy} onChange={(e) => post({ teamMaySpend: e.target.checked, workspaceId: firm.workspaceId })}/>
                    <span>Let my team spend {firm.name}&rsquo;s credits in the other Vakilpedia apps</span>
                  </label>) : null}
                {spend.fellBack ? <p className="px-2.5 pb-1.5 pt-1 text-xs text-slate-500 dark:text-slate-400">Firm credits are not available to you right now, so Personal credits are being used.</p> : null}
                {msg ? <p className="px-2.5 pb-1.5 pt-1 text-xs text-red-600 dark:text-red-400" role="alert">{msg}</p> : null}
                <p className="px-2.5 pb-1 pt-1 text-[11px] text-slate-500 dark:text-slate-400">Switching does not move any credits.</p>
              </div>
            </>, document.body)
            : null}
    </>);
}
