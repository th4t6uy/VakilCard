// The ONE upgrade surface for VakilCard Pro — every gated tap (website,
// analytics, booking, native pay, premium theme, custom username) lands
// here. Explains value, never dead-ends, never force-charges: Cancel always
// returns the user to where they were.
import React, { useEffect, useState } from "react";
import { BadgeCheck, Banknote, BarChart3, CalendarClock, Globe2, Loader2, Palette, Sparkles, X } from "lucide-react";
import { checkoutPro, getSubscription } from "../lib/vakilcardApi";

const FEATURES = [
  [BadgeCheck, "Custom Username", "vakilpedia.com/yourname"],
  [Banknote, "Native Pay", "One-tap UPI app chooser for clients"],
  [Globe2, "Website", "Your site, live on your card"],
  [CalendarClock, "Google Calendar Booking", "Clients book appointments themselves"],
  [BarChart3, "Analytics", "Views, calls, WhatsApp, payments"],
  [Palette, "Premium Themes", "Stand out with exclusive looks"],
  [Sparkles, "Remove Vakilpedia Branding", "Your card, only your name"],
];

/**
 * open: bool · onClose() · feature: highlighted feature key (optional) ·
 * onUpgraded(): called if checkout activates immediately (QA/dev session).
 */
export default function UpgradeSheet({ open, onClose, feature, onUpgraded }) {
  const [pricing, setPricing] = useState({ founder_inr: 199, regular_inr: 299 });
  const [founderAvailable, setFounderAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // null | "activated" | "pending"

  useEffect(() => {
    if (!open) return;
    setDone(null);
    getSubscription()
      .then((s) => {
        if (s && s.pricing) setPricing(s.pricing);
        if (s) setFounderAvailable(s.founder_available !== false);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const upgrade = async () => {
    setBusy(true);
    try {
      const r = await checkoutPro();
      if (r.qa_activated || (!r.pending && r.ok)) {
        setDone("activated");
        if (onUpgraded) onUpgraded();
      } else if (r.checkout_url) {
        window.location.href = r.checkout_url; // hosted checkout (provider)
      } else {
        setDone("pending");
      }
    } catch {
      setDone("pending");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl p-6 sm:p-8 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Unlock VakilCard Pro</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-slate-100 hover:bg-slate-200 p-2 -mt-1 -mr-1"><X className="h-4 w-4 text-slate-600" /></button>
        </div>
        <p className="text-sm text-slate-500 text-left hyphens-none mb-5">Everything in Free, plus the tools that turn your card into your practice's front desk.</p>

        <div className="space-y-3 mb-6">
          {FEATURES.map(([Icon, title, desc]) => {
            const hl = feature && title.toLowerCase().includes(String(feature).replace(/_/g, " "));
            return (
              <div key={title} className={`flex items-start gap-3 rounded-2xl p-3 ${hl ? "bg-[#635BFF]/10 border border-[#635BFF]/30" : ""}`}>
                <Icon className="h-5 w-5 text-[#635BFF] flex-none mt-0.5" />
                <div>
                  <p className="text-sm font-black text-slate-900">{title}</p>
                  <p className="text-xs text-slate-500 text-left hyphens-none">{desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {done === "activated" ? (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
            <p className="font-black text-emerald-800">You're Pro now 🎉</p>
            <button className="mt-3 w-full rounded-full bg-slate-900 text-white px-6 py-3.5 font-bold" onClick={onClose}>Continue</button>
          </div>
        ) : done === "pending" ? (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-center">
            <p className="text-sm font-bold text-amber-900 hyphens-none">Payments are launching shortly — your Founder price is noted. We'll message you on WhatsApp the moment checkout opens.</p>
            <button className="mt-3 w-full rounded-full bg-white border border-slate-200 px-6 py-3 font-bold text-slate-700" onClick={onClose}>Okay</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className={`rounded-2xl border-2 p-4 text-center ${founderAvailable ? "border-[#635BFF] bg-[#635BFF]/5" : "border-slate-200 opacity-50"}`}>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#635BFF]">Founder</p>
                <p className="text-2xl font-black text-slate-900 mt-1">₹{pricing.founder_inr}<span className="text-xs font-bold text-slate-500">/yr</span></p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 hyphens-none">Price locked while you stay subscribed</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Regular</p>
                <p className="text-2xl font-black text-slate-900 mt-1">₹{pricing.regular_inr}<span className="text-xs font-bold text-slate-500">/yr</span></p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 hyphens-none">After the founder window</p>
              </div>
            </div>
            <button
              className="w-full rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-8 py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              disabled={busy}
              onClick={upgrade}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              Upgrade — ₹{founderAvailable ? pricing.founder_inr : pricing.regular_inr}/year
            </button>
            <button className="mt-3 w-full text-sm font-bold text-slate-500" onClick={onClose}>Maybe later</button>
          </>
        )}
      </div>
    </div>
  );
}
