import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useAppStore } from "../../stores/appStore";

interface Props {
  onNext: () => void;
}

export default function PlanSelection({ onNext }: Props) {
  const [selected, setSelected] = useState<"trial" | "pro">("trial");
  const { tier } = useAppStore();
  const isCloud = tier === "tier4";

  const handleContinue = async () => {
    localStorage.setItem("sotto_plan", selected);
    if (selected === "pro") {
      await open("https://sotto.app/upgrade").catch(() => {});
    }
    onNext();
  };

  return (
    <div style={{ width: "100%", maxWidth: 520 }}>
      <div style={eyebrow}>Choose your plan</div>
      <h2 style={heading}>Get started with Sotto</h2>
      <p style={sub}>Pick the plan that fits you. You can upgrade any time.</p>

      {isCloud && (
        <div style={{
          marginBottom: 20,
          padding: "12px 16px",
          background: "rgba(125,211,252,0.07)",
          border: "1px solid rgba(125,211,252,0.18)",
          borderRadius: "var(--radius-md)",
          fontSize: 12, color: "var(--c-blue)", lineHeight: 1.5,
        }}>
          Your PC will use cloud transcription — we cover the cost, rate limited to 60 min/month on free tier.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
        {/* Free Trial card */}
        <button
          className="plan-card"
          onClick={() => setSelected("trial")}
          style={{
            textAlign: "left",
            padding: "24px 20px",
            background: "var(--surface)",
            border: "1px solid " + (selected === "trial" ? "var(--c-violet)" : "var(--border)"),
            borderRadius: "var(--radius-card)",
            position: "relative",
            overflow: "hidden",
            cursor: "pointer",
            transition: "border-color 0.15s",
            boxShadow: selected === "trial" ? "0 0 0 1px rgba(167,139,250,0.2), 0 0 24px rgba(167,139,250,0.08)" : "none",
          }}
        >
          {selected === "trial" && (
            <div style={{
              position: "absolute", top: 0, left: 14, right: 14, height: 1,
              background: "linear-gradient(90deg, transparent, var(--c-violet), transparent)",
            }} />
          )}
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.12em", color: "var(--c-amber)",
            fontFamily: "var(--font-mono)", marginBottom: 8,
          }}>
            Free trial
          </div>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 28, fontWeight: 400,
            color: "var(--text)", marginBottom: 16,
          }}>
            14 days free
          </div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {["Full local transcription", "Unlimited dictation during trial", "No card required"].map(f => (
              <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
                <span style={{ color: "var(--c-mint)", fontSize: 14 }}>✓</span>
                {f}
              </li>
            ))}
          </ul>
        </button>

        {/* Pro card */}
        <button
          className="plan-card"
          onClick={() => setSelected("pro")}
          style={{
            textAlign: "left",
            padding: "24px 20px",
            background: "var(--surface)",
            border: "1px solid " + (selected === "pro" ? "var(--c-violet)" : "var(--border)"),
            borderRadius: "var(--radius-card)",
            position: "relative",
            overflow: "hidden",
            cursor: "pointer",
            transition: "border-color 0.15s",
            boxShadow: selected === "pro" ? "0 0 0 1px rgba(167,139,250,0.2), 0 0 24px rgba(167,139,250,0.08)" : "none",
          }}
        >
          {selected === "pro" && (
            <div style={{
              position: "absolute", top: 0, left: 14, right: 14, height: 1,
              background: "linear-gradient(90deg, transparent, var(--c-violet), transparent)",
            }} />
          )}
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.12em", color: "var(--c-violet)",
            fontFamily: "var(--font-mono)", marginBottom: 8,
          }}>
            Pro
          </div>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 28, fontWeight: 400,
            color: "var(--text)", marginBottom: 16,
          }}>
            $10 / month
          </div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {["Everything in trial", "Cloud smart formatting", "Priority queue", "Cancel anytime"].map(f => (
              <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
                <span style={{ color: "var(--c-mint)", fontSize: 14 }}>✓</span>
                {f}
              </li>
            ))}
          </ul>
        </button>
      </div>

      <button
        onClick={handleContinue}
        style={{
          background: "#f5f5f7", color: "#0a0a0c",
          border: "1px solid rgba(255,255,255,0.8)",
          borderRadius: 10, padding: "10px 24px",
          fontSize: 13, fontWeight: 500,
          cursor: "pointer",
        }}
      >
        {selected === "pro" ? "Upgrade to Pro" : "Start free trial"}
      </button>
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.14em", color: "var(--text-3)",
  fontFamily: "var(--font-mono)", marginBottom: 10,
};

const heading: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 32, fontWeight: 400,
  color: "var(--text)", margin: "0 0 8px", lineHeight: 1.15,
};

const sub: React.CSSProperties = {
  color: "var(--text-3)", fontSize: 13, margin: "0 0 24px", lineHeight: 1.6,
};

import React from "react";
