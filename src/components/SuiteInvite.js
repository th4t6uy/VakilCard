import React, { useState } from "react";
import { setTokens } from "../lib/vakilcardApi";

/**
 * "You are already signed in to Vakilpedia. Make your card."
 *
 * Shown only when the silent bridge in App.js found a live, email-confirmed
 * Vakilpedia session on this browser but no VakilCard account behind it.
 * Before this, that person landed on VakilCard's signup screen and was asked
 * for a phone number and a WhatsApp OTP -- a code the platform pays for, to
 * prove an identity it had already proven a moment earlier on
 * account.vakilpedia.com.
 *
 * Nothing is written until the button is pressed, and the button sends no
 * identity of its own: the server re-reads the session cookie on that
 * request, so there is nothing here a client can forge.
 */
export default function SuiteInvite({ invite }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const firstName = String(invite.name || "").trim().split(/\s+/)[0] || null;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/vakilcard/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "create_from_suite" }),
      });
      const data = await r.json();
      if (data && data.access_token && data.refresh_token) {
        setTokens(data);
        // Land on the setup wizard, not the marketing page: the card exists
        // now but it is a draft, and the next useful thing is filling it in.
        window.location.href = "/setup";
        return;
      }
      setError(
        data && data.error === "email_not_confirmed"
          ? "Confirm your email on Vakilpedia first, then try again."
          : "We couldn't set that up just now. Please try again."
      );
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(15, 23, 42, 0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Create your VakilCard"
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 20,
          padding: "28px 24px",
          boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
          textAlign: "center",
          color: "#0f172a",
        }}
      >
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          Signed in to Vakilpedia as {invite.email}
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: "10px 0 6px" }}>
          {firstName ? `${firstName}, make your VakilCard` : "Make your VakilCard"}
        </h2>
        <p style={{ fontSize: 14, color: "#475569", margin: "0 0 20px", lineHeight: 1.5 }}>
          One link with your chamber, timings, fee, UPI and contact. No new sign-in, no code on
          WhatsApp — we already know it&apos;s you.
        </p>

        {error && (
          <p style={{ fontSize: 13, color: "#dc2626", margin: "0 0 12px" }}>{error}</p>
        )}

        <button
          type="button"
          onClick={create}
          disabled={busy}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 999,
            border: "none",
            background: "#0f172a",
            color: "#fff",
            fontSize: 15,
            fontWeight: 500,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Setting it up…" : "Create your VakilCard"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            marginTop: 10,
            background: "none",
            border: "none",
            color: "#64748b",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
