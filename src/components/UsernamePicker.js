// "Your card's link" — the ONE place a lawyer picks vakilpedia.com/<link>.
// Founder, 5 Oct 2026: picking a username must be easy and prominent, and a
// custom (Pro) link is paid for right here, in the same sheet.
//
// Free links (no payment): the automatic one (initials + phone digits) or
// the mobile number itself (with consent — it becomes public).
// Custom link: live availability as they type. Pro → applied at once.
// Free → the link is HELD for 30 minutes (nobody else can take it), the Pro
// checkout opens in place, and payment success makes it theirs. If the tab
// closes after paying, the next dashboard load applies it (server side).
import React, { useEffect, useRef, useState } from "react";
import { Check, Link2, Loader2, Lock, Smartphone, Sparkles } from "lucide-react";
import {
  applyPendingUsername,
  changeUsername,
  checkUsername,
  getSubscription,
  holdUsername,
  setUsernameAuto,
  setUsernamePhone,
} from "../lib/vakilcardApi";
import UpgradeSheet from "./UpgradeSheet";

const RULE = /^(?=.{3,30}$)[a-z0-9]+([._-][a-z0-9]+)*$/;

const STATUS_TEXT = {
  checking: "Checking…",
  taken: "Already taken — try another.",
  held: "Someone is paying for this link right now — try another.",
  reserved: "Reserved — please pick another.",
  invalid: "3–30 letters or numbers; dots, hyphens and underscores allowed in between. Not only numbers.",
  error: "Couldn't check just now — try again.",
};

/**
 * profile: { username, created_username, phone, full_name }
 * pro: boolean (entitlements.pro)
 * onChanged(newUsername): after any successful change
 * compact: smaller heading (dashboard sheet)
 */
export default function UsernamePicker({ profile, pro, onChanged, compact = false }) {
  const current = (profile && profile.username) || "";
  const [value, setValue] = useState(current);
  const [status, setStatus] = useState("same"); // same|checking|ok|taken|held|reserved|invalid|error
  const [busy, setBusy] = useState(null); // null | "custom" | "auto" | "phone"
  const [msg, setMsg] = useState("");
  const [held, setHeld] = useState(null); // link held while paying
  const [price, setPrice] = useState(null); // ₹ incl. GST, for the button
  const [upsell, setUpsell] = useState(false); // "Your own name: Pro" tapped
  const timer = useRef();

  useEffect(() => {
    setValue(current);
    setStatus("same");
  }, [current]);

  useEffect(() => {
    if (pro) return;
    getSubscription()
      .then((s) => {
        const p = s && s.pricing;
        if (!p) return;
        const base = s.founder_available !== false ? p.founder_inr : p.regular_inr;
        const gst = Number(p.gst_percent) || 18;
        setPrice(Math.round(base * (100 + gst)) / 100);
      })
      .catch(() => {});
  }, [pro]);

  const onInput = (raw) => {
    const u = raw.toLowerCase().replace(/\s+/g, "");
    setValue(u);
    setMsg("");
    clearTimeout(timer.current);
    if (u === current) return setStatus("same");
    if (!RULE.test(u) || /^[0-9]+$/.test(u)) return setStatus("invalid");
    setStatus("checking");
    timer.current = setTimeout(async () => {
      try {
        const r = await checkUsername(u);
        setStatus(r.available ? "ok" : r.reason || "taken");
      } catch {
        setStatus("error");
      }
    }, 350);
  };

  const done = (u, text) => {
    setMsg(text || "Saved — your card now lives at this link. Old links keep working.");
    setStatus("same");
    if (onChanged) onChanged(u);
  };

  const fail = (e) => {
    const code = (e && e.code) || "";
    if (/taken|held|reserved/.test(code)) setStatus(code.replace("username_", ""));
    setMsg(STATUS_TEXT[code.replace("username_", "")] || "Couldn't save — please try again.");
  };

  const useCustom = async () => {
    setBusy("custom");
    setMsg("");
    try {
      if (pro) {
        const r = await changeUsername(value);
        done(r.username);
      } else {
        const r = await holdUsername(value);
        setHeld(r.username); // opens the checkout sheet below
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const afterPaid = async () => {
    const want = held;
    setHeld(null);
    try {
      const r = await applyPendingUsername();
      done(r.username || want);
    } catch {
      // Payment is in; the dashboard applies the link on its next load.
      setMsg("Payment received — your new link will appear in a moment.");
      if (onChanged) onChanged(null);
    }
  };

  const useAuto = async () => {
    setBusy("auto");
    setMsg("");
    try {
      const r = await setUsernameAuto(profile && profile.full_name);
      done(r.username);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const usePhone = async () => {
    if (!window.confirm("Your mobile number will be part of your public card link. Continue?")) return;
    setBusy("phone");
    setMsg("");
    try {
      const r = await setUsernamePhone();
      done(r.username);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const phoneDigits = String((profile && profile.phone) || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  const autoLink = profile && profile.created_username;
  const canPick = status === "ok";

  return (
    <div className="rounded-3xl border-2 border-[#635BFF]/40 bg-[#635BFF]/[0.04] dark:bg-[#635BFF]/10 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="h-4 w-4 text-[#635BFF] dark:text-[#a5a0ff]" />
        <p className={`${compact ? "text-sm" : "text-base"} font-black text-slate-900 dark:text-white`}>Your card's link</p>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 text-left hyphens-none mb-3">
        This is the address you share. Change it any time — old links keep working.
      </p>

      <label className="flex items-stretch rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden focus-within:border-[#635BFF]">
        <span className="flex items-center pl-3 pr-1 text-sm sm:text-base text-slate-500 dark:text-slate-400 select-none whitespace-nowrap">vakilpedia.com/</span>
        <input
          className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-base sm:text-lg font-black text-slate-900 dark:text-white focus:outline-none"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          value={value}
          onChange={(e) => onInput(e.target.value)}
          aria-label="Your card's link"
        />
        <span className="flex items-center pr-3">
          {status === "checking" ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : status === "ok" ? (
            <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          ) : null}
        </span>
      </label>

      <p
        className={`mt-1.5 min-h-[1rem] text-xs font-semibold text-left hyphens-none ${
          status === "ok" ? "text-emerald-700 dark:text-emerald-300" : status === "same" || status === "checking" ? "text-slate-500 dark:text-slate-400" : "text-rose-700 dark:text-rose-300"
        }`}
      >
        {status === "ok" ? "Available" : status === "same" ? "This is your link now." : STATUS_TEXT[status] || ""}
      </p>

      {canPick && (
        <button
          type="button"
          disabled={!!busy}
          onClick={useCustom}
          className="mt-2 w-full rounded-full bg-[#635BFF] hover:bg-[#5249e6] text-white px-6 py-3.5 font-bold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy === "custom" ? <Loader2 className="h-5 w-5 animate-spin" /> : pro ? <Check className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          {pro
            ? "Use this link"
            : `Get this link${price ? ` — ₹${Number.isInteger(price) ? price : price.toFixed(2)}/year` : ""}`}
        </button>
      )}
      {canPick && !pro && (
        <p className="mt-1.5 text-[11px] text-center text-slate-500 dark:text-slate-400 hyphens-none">
          Custom links come with VakilCard Pro (incl. GST, UPI Autopay, cancel anytime). Pay here — the link is held for you while you pay.
        </p>
      )}

      {(autoLink || phoneDigits) && (
        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Free links</p>
          <div className="flex flex-wrap gap-2">
            {autoLink && autoLink !== current && (
              <button
                type="button"
                disabled={!!busy}
                onClick={useAuto}
                className="rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {busy === "auto" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}/{autoLink}
              </button>
            )}
            {phoneDigits && phoneDigits !== current && (
              <button
                type="button"
                disabled={!!busy}
                onClick={usePhone}
                className="rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {busy === "phone" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}/{phoneDigits}
              </button>
            )}
            {!pro && (
              <button type="button" onClick={() => setUpsell(true)} className="inline-flex items-center gap-1 rounded-full border border-[#635BFF]/30 bg-[#635BFF]/10 px-3 py-2 text-[11px] font-black text-[#635BFF] dark:text-[#a5a0ff]">
                <Lock className="h-3 w-3" /> Your own name — Pro
              </button>
            )}
          </div>
        </div>
      )}

      {msg && <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200 text-left hyphens-none">{msg}</p>}

      <UpgradeSheet
        open={upsell && !held}
        feature="custom_username"
        onClose={() => setUpsell(false)}
        onUpgraded={() => { setUpsell(false); if (onChanged) onChanged(null); }}
      />
      <UpgradeSheet
        open={!!held}
        feature="custom_username"
        heldLink={held}
        onClose={() => setHeld(null)}
        onUpgraded={afterPaid}
      />
    </div>
  );
}
