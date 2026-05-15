import { useState } from "react";

interface Props {
  onNext: () => void;
}

type PermState = "idle" | "granted" | "denied";

export default function PermissionsStep({ onNext }: Props) {
  const [micState, setMicState] = useState<PermState>("idle");

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicState("granted");
    } catch {
      setMicState("denied");
    }
  };

  const canContinue = micState === "granted";

  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <div style={eyebrow}>Permissions</div>
      <h2 style={heading}>Allow access</h2>
      <p style={sub}>Sotto needs a few permissions to work properly.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
        {/* Microphone */}
        <div style={card}>
          <div style={{ position: "absolute", top: 0, left: 14, right: 14, height: 1,
            background: "linear-gradient(90deg, transparent, var(--c-violet), transparent)" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={iconWrap}>
                  <MicIcon />
                </div>
                <div style={rowTitle}>Microphone</div>
                {micState === "granted" && <span style={checkBadge}>✓ Granted</span>}
                {micState === "denied"  && <span style={denyBadge}>✗ Denied</span>}
              </div>
              <div style={rowSub}>Required for voice dictation.</div>
              {micState === "denied" && (
                <div style={{ fontSize: 11, color: "var(--c-rose)", marginTop: 6 }}>
                  Permission was denied. Please allow microphone access in your system settings.
                </div>
              )}
            </div>
            {micState === "idle" && (
              <button onClick={requestMic} style={defaultBtn}>
                Allow
              </button>
            )}
          </div>
        </div>

        {/* Text injection */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={iconWrap}>
              <KeyboardIcon />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={rowTitle}>Text injection</div>
                <span style={checkBadge}>✓ Ready</span>
              </div>
              <div style={rowSub}>
                Sotto types into your apps using keyboard simulation. No special permission required on Windows.
              </div>
            </div>
          </div>
        </div>

        {/* Accessibility */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={iconWrap}>
              <TrayIcon />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={rowTitle}>Background access</div>
                <span style={checkBadge}>✓ Ready</span>
              </div>
              <div style={rowSub}>
                Sotto runs in the background. It will appear in your system tray.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={onNext}
          disabled={!canContinue}
          style={{
            background: canContinue ? "#f5f5f7" : "rgba(255,255,255,0.07)",
            color: canContinue ? "#0a0a0c" : "var(--text-4)",
            border: "1px solid " + (canContinue ? "rgba(255,255,255,0.8)" : "var(--border)"),
            borderRadius: 10, padding: "10px 24px",
            fontSize: 13, fontWeight: 500,
            cursor: canContinue ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
        >
          Continue
        </button>
        <button
          onClick={onNext}
          style={{
            background: "transparent", border: "none",
            color: "var(--text-3)", fontSize: 13, cursor: "pointer",
          }}
        >
          Skip for now
        </button>
      </div>
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
const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-card)",
  padding: "var(--pad-card)",
  position: "relative",
  overflow: "hidden",
};
const iconWrap: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
  background: "var(--surface-2)", border: "1px solid var(--border)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const rowTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "var(--text)",
};
const rowSub: React.CSSProperties = {
  fontSize: 12, color: "var(--text-3)", lineHeight: 1.5,
};
const defaultBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.035)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 10, padding: "8px 14px",
  fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0,
};
const checkBadge: React.CSSProperties = {
  fontSize: 11, fontWeight: 600,
  color: "var(--c-mint)",
  background: "rgba(52,211,153,0.1)",
  border: "1px solid rgba(52,211,153,0.2)",
  borderRadius: 99, padding: "2px 8px",
};
const denyBadge: React.CSSProperties = {
  fontSize: 11, fontWeight: 600,
  color: "var(--c-rose)",
  background: "rgba(251,113,133,0.1)",
  border: "1px solid rgba(251,113,133,0.2)",
  borderRadius: 99, padding: "2px 8px",
};

function MicIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(125,211,252,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>
    </svg>
  );
}

function TrayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  );
}

import React from "react";
