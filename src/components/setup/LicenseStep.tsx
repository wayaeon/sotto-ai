import { useState } from "react";

interface Props {
  onComplete: () => void;
}

export default function LicenseStep({ onComplete }: Props) {
  const [keyInput, setKeyInput] = useState("");
  const [mode, setMode] = useState<"choose" | "enter_key">("choose");
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");

  const startTrial = () => {
    localStorage.setItem("sotto_trial_start", Date.now().toString());
    onComplete();
  };

  const activateKey = async () => {
    if (!keyInput.trim()) return;
    setActivating(true);
    setError("");
    try {
      const resp = await fetch("https://license.sotto.app/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyInput.trim() }),
      });
      const data = await resp.json() as { valid: boolean; error?: string };
      if (data.valid) {
        localStorage.setItem("sotto_license_key", keyInput.trim());
        onComplete();
      } else {
        setError(data.error ?? "Invalid license key");
      }
    } catch {
      setError("Could not reach license server. Check your connection.");
    } finally {
      setActivating(false);
    }
  };

  if (mode === "enter_key") {
    return (
      <div style={s.root}>
        <div style={s.eyebrow}>License</div>
        <h2 style={s.heading}>Enter your key</h2>
        <p style={s.sub}>From your purchase confirmation email.</p>
        <input
          style={s.input}
          placeholder="SOTTO-XXXX-XXXX-XXXX"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && activateKey()}
          autoFocus
        />
        {error && <div style={s.error}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button style={s.ghostBtn} onClick={() => setMode("choose")}>Back</button>
          <button style={s.btn} onClick={activateKey} disabled={activating}>
            {activating ? "Activating…" : "Activate"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.eyebrow}>Almost there</div>
      <h2 style={s.heading}>Get started with Sotto</h2>
      <p style={s.sub}>Try it free for 14 days — no credit card required.</p>

      <div style={s.options}>
        <button style={s.primaryOption} onClick={startTrial}>
          <div style={s.optionTitle}>Start free trial</div>
          <div style={s.optionSub}>14 days · full access · no card needed</div>
        </button>

        <button style={s.secondaryOption} onClick={() => setMode("enter_key")}>
          <div style={s.optionTitle}>I have a license key</div>
          <div style={s.optionSub}>$15 one-time · $9/mo cloud</div>
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { width: "100%", maxWidth: 480 },
  eyebrow: { color: "#6366f1", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 },
  heading: { color: "#fff", fontSize: 24, fontWeight: 700, margin: "0 0 8px", lineHeight: 1.2 },
  sub: { color: "rgba(255,255,255,0.35)", fontSize: 13, margin: "0 0 28px", lineHeight: 1.6 },
  options: { display: "flex", flexDirection: "column", gap: 10 },
  primaryOption: {
    background: "#6366f1", border: "none",
    borderRadius: 12, padding: "18px 20px", cursor: "pointer", textAlign: "left", color: "#fff",
    transition: "opacity 0.15s",
  },
  secondaryOption: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12, padding: "16px 20px", cursor: "pointer", textAlign: "left", color: "#fff",
  },
  optionTitle: { fontWeight: 600, fontSize: 15, marginBottom: 3 },
  optionSub: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  input: {
    width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, color: "#fff", fontSize: 14, padding: "11px 14px",
    outline: "none", fontFamily: "monospace", letterSpacing: 1,
  },
  error: { color: "#ef4444", fontSize: 12, marginTop: 8 },
  btn: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent", color: "rgba(255,255,255,0.4)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "10px 16px", fontSize: 13, cursor: "pointer",
  },
};
