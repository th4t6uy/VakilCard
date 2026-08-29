// The ONE upgrade surface for VakilCard Pro — every gated tap (website,
// analytics, booking, native pay, premium theme, custom username, Google
// Business) lands here. Explains value, never dead-ends, never
// force-charges: Cancel always returns the user to where they were.
//
// Founder direction (2026-08-15): a Free user clicking ANY paid feature must
// SEE that feature — the sheet opens with a greyed-out, non-interactive
// preview of the exact thing they tapped, with the benefit spelled out, so
// they know what they're missing before the price is even mentioned.
import React, { useEffect, useState } from "react";
import { BadgeCheck, Banknote, BarChart3, CalendarClock, Check, Globe2, Loader2, MapPin, Palette, Sparkles, Star, Ticket, X } from "lucide-react";
import { checkoutPro, getSubscription, loadRazorpay, previewCoupon, verifyProPayment } from "../lib/vakilcardApi";

const FEATURES = [
  [BadgeCheck, "Custom Username", "vakilpedia.com/yourname"],
  [Banknote, "Native Pay", "One-tap UPI app chooser for clients"],
  [Globe2, "Website", "Your site, live on your card"],
  [CalendarClock, "Google Calendar Booking", "Clients book appointments themselves"],
  [BarChart3, "Analytics", "Views, calls, WhatsApp, payments"],
  [Palette, "Premium Themes", "Stand out with exclusive looks"],
  [Sparkles, "Remove Vakilpedia Branding", "Your card, only your name"],
  [Star, "One-Tap Reviews", "Clients land straight in your Google review form"],
  [MapPin, "Google Business Tile", "Your listing, rating and reviews — free for everyone"],
];

/* ---------------- greyed-out feature previews ----------------
   Small, honest mock-ups of the REAL UI each feature unlocks. Rendered
   non-interactive + desaturated, clearly labelled a preview. Sample numbers
   are obviously samples — never presented as the user's own data. */

const previewShell = "rounded-2xl border border-slate-200 bg-slate-50 p-3 select-none pointer-events-none";
const segOn = "flex-1 rounded-xl border-2 border-[#635BFF] bg-white p-2.5 text-center";
const segOff = "flex-1 rounded-xl border border-slate-200 bg-white p-2.5 text-center";

function PayPreview() {
  return (
    <div className={previewShell} aria-hidden="true">
      <div className="flex gap-2">
        <div className={segOn}>
          <p className="text-[11px] font-black text-slate-900">Pay consultation fee</p>
          <p className="text-sm font-black text-slate-900 mt-0.5">₹2,000</p>
        </div>
        <div className={segOff}>
          <p className="text-[11px] font-black text-slate-500">Custom amount</p>
          <p className="text-[10px] text-slate-400 mt-0.5">client chooses</p>
        </div>
      </div>
      <div className="flex justify-center gap-3 mt-2.5">
        {["gpay", "phonepe", "paytm"].map((k) => (
          <span key={k} className="h-10 w-10 rounded-xl grid place-items-center overflow-hidden">
            <img src={`/ds/assets/upi/${k}.png`} alt="" className="h-10 w-10 object-contain" onError={(e) => { e.currentTarget.replaceWith("₹"); }} />
          </span>
        ))}
      </div>
    </div>
  );
}

function AnalyticsPreview() {
  return (
    <div className={previewShell} aria-hidden="true">
      <div className="grid grid-cols-4 gap-2">
        {[["Views", "214"], ["Calls", "32"], ["WhatsApp", "41"], ["Payments", "9"]].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-white border border-slate-200 py-2 text-center">
            <p className="text-base font-black text-slate-900">{v}</p>
            <p className="text-[9px] font-bold text-slate-500">{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingPreview() {
  return (
    <div className={previewShell} aria-hidden="true">
      <div className="space-y-1.5">
        <p className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" />Google Calendar checked — never double-booked</p>
        <p className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 flex items-center gap-2"><Banknote className="h-3.5 w-3.5 text-[#635BFF]" />Fee collected before the slot is confirmed</p>
      </div>
    </div>
  );
}

function WebsitePreview() {
  return (
    <div className={previewShell} aria-hidden="true">
      <p className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-[12px] font-bold text-slate-800 flex items-center gap-2"><Globe2 className="h-4 w-4 text-[#635BFF]" />yourchambers.in — live on your card</p>
    </div>
  );
}

function ThemesPreview() {
  return (
    <div className={previewShell} aria-hidden="true">
      <div className="flex items-center justify-center gap-3">
        {[["Default", "bg-gradient-to-br from-slate-100 to-slate-300 border-slate-300"], ["Midnight", "bg-gradient-to-br from-slate-800 to-slate-950 border-slate-700"], ["Ivory", "bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200"]].map(([l, c]) => (
          <div key={l} className="text-center">
            <span className={`block h-10 w-10 rounded-full border-2 ${c}`} />
            <p className="text-[9px] font-bold text-slate-500 mt-1">{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandingPreview() {
  return (
    <div className={previewShell} aria-hidden="true">
      <p className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-400 text-center line-through">Powered by Vakilpedia</p>
      <p className="text-[10px] font-bold text-slate-500 text-center mt-1.5">Your card, only your name.</p>
    </div>
  );
}

function ReviewPreview() {
  return (
    <div className={previewShell} aria-hidden="true">
      <p className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-[12px] font-black text-slate-800 flex items-center justify-center gap-2"><Star className="h-4 w-4 text-amber-500" />Leave a Review — straight to your Google form</p>
    </div>
  );
}

function GoogleBusinessPreview() {
  return (
    <div className={previewShell} aria-hidden="true">
      <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 flex items-center gap-2.5">
        <span className="h-9 w-9 rounded-lg bg-white border border-slate-200 shadow-sm grid place-items-center overflow-hidden flex-none">
          <img src="/ds/assets/brands/google-maps.png" alt="" className="h-7 w-7 object-contain" onError={(e) => { e.currentTarget.replaceWith("G"); }} />
        </span>
        <span className="min-w-0">
          <p className="text-[12px] font-black text-slate-900 truncate">Your Law Chambers</p>
          <p className="text-[10px] text-slate-500 flex items-center gap-1"><span className="text-amber-500">★★★★★</span> Reviews · Photos · Directions</p>
        </span>
      </div>
    </div>
  );
}

function UsernamePreview() {
  return (
    <div className={previewShell} aria-hidden="true">
      <p className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-[12px] font-black text-center text-slate-800">vakilpedia.com/<span className="text-[#635BFF]">yourname</span></p>
    </div>
  );
}

// feature key (api/vakilcard/_entitlements.js PRO_FEATURES) → preview + pitch
const FEATURE_PREVIEWS = {
  native_pay: [PayPreview, "Clients pay your set consultation fee — or any amount — in one tap, straight into your UPI."],
  pay: [PayPreview, "Clients pay your set consultation fee — or any amount — in one tap, straight into your UPI."],
  analytics: [AnalyticsPreview, "See exactly how your card works for you — every view, call, WhatsApp and payment, counted."],
  booking: [BookingPreview, "Bookings that check your real calendar and collect your fee before the slot is confirmed."],
  website: [WebsitePreview, "Your own website, one tap away for every client who opens your card."],
  premium_themes: [ThemesPreview, "Exclusive card looks that make your card unmistakably yours."],
  remove_branding: [BrandingPreview, "Remove the Vakilpedia footer — clients see your name and nothing else."],
  // Restored 2026-08-29. Briefly removed while the review link had no writer;
  // the Places API returns Google's own writeAReviewUri, so this sells a
  // feature that works again.
  google_review: [ReviewPreview, "Happy clients become 5-star Google reviews — one tap, no searching."],
  google_business: [GoogleBusinessPreview, "Your Google Business listing as a native tile on your card — reviews, photos and directions, one tap away."],
  custom_username: [UsernamePreview, "Swap the number in your link for your own name — memorable on letterheads and court corridors."],
};

/**
 * open: bool · onClose() · feature: highlighted feature key (optional) ·
 * onUpgraded(): called if checkout activates immediately (QA/dev session).
 */
export default function UpgradeSheet({ open, onClose, feature, onUpgraded }) {
  const [pricing, setPricing] = useState({ founder_inr: 199, regular_inr: 299 });
  const [founderAvailable, setFounderAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // null | "activated" | "pending"
  // Coupon state — a valid discount code (e.g. FOUNDER33) reprices the first
  // year before any payment starts. Validation is entirely server-side.
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState(null); // applied server preview
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDone(null);
    setCouponInput("");
    setCoupon(null);
    setCouponError("");
    getSubscription()
      .then((s) => {
        if (s && s.pricing) setPricing(s.pricing);
        if (s) setFounderAvailable(s.founder_available !== false);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const COUPON_ERRORS = {
    invalid_code: "That code isn't valid.",
    expired: "This code has expired.",
    exhausted: "This code has been fully used.",
    coupon_paused: "This code is paused right now.",
    wrong_product: "That code is for a different Vakilpedia app.",
    not_applicable_at_checkout: "That code can't be applied at checkout.",
    coupon_unavailable: "Couldn't check the code — try again.",
  };

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponError("");
    try {
      const r = await previewCoupon(code);
      if (r && r.ok) {
        setCoupon(r);
      } else {
        setCoupon(null);
        setCouponError(COUPON_ERRORS[r && r.error] || "That code isn't valid.");
      }
    } catch {
      setCouponError("Couldn't check the code — try again.");
    } finally {
      setCouponBusy(false);
    }
  };

  const upgrade = async () => {
    setBusy(true);
    try {
      const r = await checkoutPro(coupon ? coupon.code : undefined);
      if (r.qa_activated || (!r.pending && r.ok && !r.subscription_id)) {
        setDone("activated");
        if (onUpgraded) onUpgraded();
      } else if (r.subscription_id) {
        // In-app Razorpay Checkout — UPI Autopay yearly subscription.
        const Razorpay = await loadRazorpay();
        const modal = new Razorpay({
          key: r.key_id,
          subscription_id: r.subscription_id,
          name: "VakilCard Pro",
          description: r.coupon_applied
            ? `First year ₹${r.first_charge_inr}, renews ₹${r.renewal_inr}/yr`
            : `₹${r.first_charge_inr}/yr`,
          theme: { color: "#635BFF" },
          // Founder decision (2026-08-19): this must be UPI Autopay only.
          // Razorpay subscription checkout otherwise also offers Card and
          // eMandate/netbanking mandates by default — restrict the popup to
          // the UPI instrument so no other recurring rail can be selected.
          // Config shape per Razorpay's documented "show only one payment
          // method" pattern (config.display.blocks / show_default_blocks).
          config: {
            display: {
              blocks: {
                upiBlock: {
                  name: "Pay via UPI Autopay",
                  instruments: [{ method: "upi" }],
                },
              },
              sequence: ["block.upiBlock"],
              preferences: { show_default_blocks: false },
            },
          },
          handler: async (resp) => {
            try {
              const v = await verifyProPayment(resp);
              if (v && v.ok) {
                setDone("activated");
                if (onUpgraded) onUpgraded();
              } else {
                setDone("pending");
              }
            } catch {
              setDone("pending");
            } finally {
              setBusy(false);
            }
          },
          modal: { ondismiss: () => setBusy(false) },
        });
        modal.on("payment.failed", () => setBusy(false));
        modal.open();
        return; // busy stays true until the modal resolves/dismisses
      } else if (r.checkout_url) {
        window.location.href = r.checkout_url; // hosted checkout (provider)
      } else {
        setDone("pending");
      }
      setBusy(false);
    } catch (e) {
      if (e && e.code === "coupon_offer_not_configured") {
        setCouponError("This code isn't ready yet — please try again shortly.");
      } else {
        setDone("pending");
      }
      setBusy(false);
    }
  };

  const preview = feature && FEATURE_PREVIEWS[feature];
  const PreviewBlock = preview ? preview[0] : null;

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

        {/* The feature the user just tapped — shown greyed out, exactly as it
            would look unlocked, so they see what they're missing. */}
        {PreviewBlock && (
          <div className="relative mb-5">
            <span className="absolute -top-2 left-3 z-10 rounded-full bg-[#635BFF] text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5">Pro preview</span>
            <div className="opacity-70 grayscale-[35%]">
              <PreviewBlock />
            </div>
            <p className="text-xs text-slate-600 text-left hyphens-none mt-2">{preview[1]}</p>
          </div>
        )}

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
            {coupon ? (
              <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 flex items-center justify-center gap-1">
                  <Ticket className="h-3.5 w-3.5" /> {coupon.code} applied
                </p>
                <p className="text-2xl font-black text-slate-900 mt-1">
                  <span className="text-base font-bold text-slate-400 line-through mr-2">₹{coupon.base_inr}</span>
                  ₹{coupon.final_inr}<span className="text-xs font-bold text-slate-500"> first year</span>
                </p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 hyphens-none">
                  Renews at ₹{coupon.base_inr}/yr · UPI Autopay, cancel anytime
                </p>
                <button
                  type="button"
                  className="mt-2 text-[11px] font-bold text-slate-500 underline"
                  onClick={() => { setCoupon(null); setCouponInput(""); }}
                >
                  Remove code
                </button>
              </div>
            ) : (
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
            )}

            {/* Coupon entry — applied BEFORE any payment starts. */}
            {!coupon && (
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-800 placeholder:font-normal focus:outline-none focus:border-[#635BFF]"
                    placeholder="Have a coupon code?"
                    value={couponInput}
                    onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(); }}
                    maxLength={24}
                    aria-label="Coupon code"
                  />
                  <button
                    type="button"
                    className="rounded-full bg-slate-100 hover:bg-slate-200 px-5 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
                    disabled={couponBusy || !couponInput.trim()}
                    onClick={applyCoupon}
                  >
                    {couponBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </button>
                </div>
                {couponError && <p className="text-xs font-bold text-rose-600 mt-1.5 ml-2">{couponError}</p>}
              </div>
            )}

            <button
              className="w-full rounded-full bg-slate-900 text-white hover:bg-[#635BFF] transition-colors px-8 py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              disabled={busy}
              onClick={upgrade}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {coupon
                ? `Upgrade — ₹${coupon.final_inr} first year`
                : `Upgrade — ₹${founderAvailable ? pricing.founder_inr : pricing.regular_inr}/year`}
            </button>
            <button className="mt-3 w-full text-sm font-bold text-slate-500" onClick={onClose}>Maybe later</button>
          </>
        )}
      </div>
    </div>
  );
}
