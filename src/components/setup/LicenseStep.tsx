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
    // Store trial start time in localStorage for now (SQLite in Task 13)
    localStorage.setItem("wispr_trial_start", Date.now().toString());
    onComplete();
  };

  const activateKey = async () => {
    if (!keyInput.trim()) return;
    setActivating(true);
    setError("");
    try {
      // Validate against Cloudflare worker
      const resp = await fetch("https://license.wispr-local.workers.dev/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyInput.trim() }),
      });
      const data = await resp.json() as { valid: boolean; error?: string };
      if (data.valid) {
        localStorage.setItem("wispr_license_key", keyInput.trim());
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
      <div>
        <h2 style={s.heading}>Enter License Key</h2>
        <p style={s.sub}>Enter your key from your purchase confirmation email.</p>
        <input
          style={s.input}
          placeholder="WISPR-XXXX-XXXX-XXXX"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && activateKey()}
        />
        {error && <div style={s.error}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button style={s.ghostBtn} onClick={() => setMode("choose")}>← Back</button>
          <button style={s.btn} onClick={activateKey} disabled={activating}>
            {activating ? "Activating…" : "Activate"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={s.heading}>Choose How to Get Started</h2>
      <p style={s.sub}>You can try Wispr Local free for 14 days, no credit card required.</p>

      <div style={s.options}>
        <button style={s.optionBtn} onClick={startTrial}>
          <div style={s.optionTitle}>Start 14-Day Free Trial</div>
          <div style={s.optionSub}>Full access, no credit card. Local mode.</div>
        </button>

        <button style={s.optionBtn} onClick={() => setMode("enter_key")}>
          <div style={s.optionTitle}>I have a license key</div>
          <div style={s.optionSub}>$15 one-time (local) · $9/mo (cloud)</div>
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 8px", color: "#fff", fontSize: 18, fontWeight: 600 },
  sub: { margin: "0 0 24px", color: "#888", fontSize: 14 },
  options: { display: "flex", flexDirection: "column", gap: 12 },
  optionBtn: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12, padding: "16px 20px", cursor: "pointer", textAlign: "left", color: "#fff",
  },
  optionTitle: { fontWeight: 600, fontSize: 15, marginBottom: 4 },
  optionSub: { color: "#888", fontSize: 13 },
  input: {
    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, color: "#fff", fontSize: 15, padding: "10px 14px", boxSizing: "border-box",
    outline: "none", fontFamily: "monospace",
  },
  error: { color: "#ef4444", fontSize: 13, marginTop: 8 },
  btn: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent", color: "#888", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, padding: "10px 16px", fontSize: 13, cursor: "pointer",
  },
};
