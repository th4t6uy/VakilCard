import React, { useState } from "react";
import { CalendarCheck, Loader2, Video } from "lucide-react";
import { googleConnectUrl } from "../lib/vakilcardApi";

/**
 * The one optional Google screen, shown right after a card is first published (founder, 9 Oct 2026:
 * "one optional step after sign-up"). One tap connects Google Calendar; "Not now" goes on to the
 * dashboard and the same button stays in Booking & Reviews.
 *
 * Only Calendar is asked for. The Google Business tile needs no permission at all (the lawyer picks
 * their listing by name), so there is nothing more to bundle here.
 */
export default function GoogleConnectStep({ onSkip }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const connect = async () => {
    setBusy(true);
    setErr("");
    try {
      window.location.href = await googleConnectUrl();
    } catch (e) {
      setBusy(false);
      setErr(
        e && e.status === 401
          ? "Please sign in to VakilCard again, then try once more — or do this later from your dashboard."
          : "Couldn't start Google just now — you can do this later from your dashboard."
      );
    }
  };
  return (
    <div className="max-w-md mx-auto px-5 py-10 text-center" data-testid="google-connect-step">
      <div className="mx-auto grid place-items-center h-14 w-14 rounded-2xl bg-[#635BFF]/10 text-[#635BFF] dark:text-[#a5a0ff]">
        <CalendarCheck className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mt-5">Let clients book you</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed hyphens-none">
        Connect your Google Calendar once. Then send any client a private booking link on WhatsApp or email — they pick a free time and a Google Meet is made for you both. It is free.
      </p>
      <ul className="text-left text-sm text-slate-700 dark:text-slate-200 mt-5 space-y-2 list-none p-0">
        <li className="flex gap-2"><Video className="h-4 w-4 mt-0.5 flex-none text-[#635BFF] dark:text-[#a5a0ff]" />Clients only see times you are really free</li>
        <li className="flex gap-2"><Video className="h-4 w-4 mt-0.5 flex-none text-[#635BFF] dark:text-[#a5a0ff]" />Every meeting lands in your calendar with a Meet link</li>
      </ul>
      <button type="button" onClick={connect} disabled={busy}
        className="mt-7 w-full rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3.5 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Connect Google Calendar
      </button>
      <button type="button" onClick={onSkip} className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400 underline">Not now</button>
      {err && <p className="text-xs text-rose-600 dark:text-rose-400 mt-3">{err}</p>}
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-6 leading-relaxed hyphens-none">
        Google will ask to &ldquo;view and edit events on your calendars&rdquo;. VakilCard uses it only to see when you are busy and to add the meetings you book. You can disconnect any time.
      </p>
    </div>
  );
}
