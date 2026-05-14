import { useState } from "react";

export default function LicenseTab() {
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const licenseKey = localStorage.getItem("wispr_license_key");
  const trialStart = localStorage.getItem("wispr_trial_start");

  const trialDaysLeft = trialStart
    ? Math.max(0, 14 - Math.floor((Date.now() - Number(trialStart)) / 86400000))
    : null;

  const activate = async () => {
    if (!keyInput.trim()) return;
    setStatus("checking");
    try {
      const resp = await fetch("https://license.wispr-local.workers.dev/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyInput.trim() }),
      });
      const data = await resp.json() as { valid: boolean };
      if (data.valid) {
        localStorage.setItem("wispr_license_key", keyInput.trim());
        setStatus("valid");
      } else {
        setStatus("invalid");
      }
    } catch {
      setStatus("invalid");
    }
  };

  return (
    <div>
      <h2 style={s.heading}>License</h2>

      {licenseKey ? (
        <div style={s.validCard}>
          <div style={s.validBadge}>✓ Licensed</div>
          <div style={s.keyDisplay}>{licenseKey.slice(0, 8)}••••••••</div>
        </div>
      ) : (
        <div style={s.trialCard}>
          <div style={s.trialLabel}>
            {trialDaysLeft !== null
              ? `Trial: ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`
              : "No license"}
          </div>
          <p style={s.trialHint}>
            Purchase at <strong style={{ color: "#a5b4fc" }}>wispr-local.com</strong> for $15 (local) or $9/mo (cloud).
          </p>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <label style={s.label}>Activate a key</label>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            style={s.input}
            placeholder="WISPR-XXXX-XXXX-XXXX"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button style={s.btn} onClick={activate} disabled={status === "checking"}>
            {status === "checking" ? "…" : "Activate"}
          </button>
        </div>
        {status === "valid" && <div style={s.success}>✓ License activated!</div>}
        {status === "invalid" && <div style={s.error}>Invalid or already used key.</div>}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 24px", color: "#fff", fontSize: 20, fontWeight: 600 },
  validCard: {
    background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
    borderRadius: 12, padding: "16px 20px",
  },
  validBadge: { color: "#22c55e", fontWeight: 700, fontSize: 15, marginBottom: 8 },
  keyDisplay: { color: "#888", fontFamily: "monospace", fontSize: 13 },
  trialCard: {
    background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
    borderRadius: 12, padding: "16px 20px",
  },
  trialLabel: { color: "#f59e0b", fontWeight: 700, fontSize: 15, marginBottom: 8 },
  trialHint: { color: "#888", fontSize: 13, margin: 0 },
  label: { color: "#ccc", fontSize: 14, fontWeight: 600 },
  input: {
    flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, color: "#fff", fontSize: 14, padding: "10px 14px", outline: "none",
    fontFamily: "monospace",
  },
  btn: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  success: { color: "#22c55e", fontSize: 13, marginTop: 8 },
  error: { color: "#ef4444", fontSize: 13, marginTop: 8 },
};
