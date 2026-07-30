import { useState } from "react";

// Hidden QA panel — only ever rendered by SetupWizard when a QA-bypass
// session is active (see lib/vakilcardQa.js). Lets a developer jump
// directly to any onboarding step instead of clicking "Continue" through
// each one. Collapsed by default so it doesn't clutter the review.
export default function QaStepJumper({ steps, step, onJump }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 2147483646,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {open && (
        <div
          style={{
            marginBottom: 8,
            padding: 10,
            borderRadius: 12,
            background: "#111827",
            border: "1px solid rgba(251,191,36,0.4)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          {steps.map((label, i) => (
            <button
              key={label}
              onClick={() => onJump(i)}
              style={{
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                background: i === step ? "#fbbf24" : "transparent",
                color: i === step ? "#111827" : "#fbbf24",
              }}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="QA: jump to step"
        title="QA: jump to any onboarding step"
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "#111827",
          border: "1px solid rgba(251,191,36,0.5)",
          color: "#fbbf24",
          fontWeight: 900,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        QA
      </button>
    </div>
  );
}
