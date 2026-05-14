import { useEffect, useState } from "react";
import { detectHardware } from "../../lib/tauri";
import { useAppStore } from "../../stores/appStore";

const TIER_LABELS: Record<string, { label: string; model: string; color: string }> = {
  tier1: { label: "High Performance", model: "whisper-large-v3-turbo (local)", color: "#22c55e" },
  tier2: { label: "GPU Accelerated", model: "parakeet-tdt-1.1b (local, NVIDIA)", color: "#6366f1" },
  tier3_en: { label: "Balanced", model: "moonshine-base (local, English)", color: "#f59e0b" },
  tier3_ml: { label: "Balanced", model: "whisper-medium (local, multilingual)", color: "#f59e0b" },
  tier4: { label: "Cloud Mode", model: "ElevenLabs Scribe v2 (cloud)", color: "#ef4444" },
};

interface Props {
  onNext: () => void;
}

export default function HardwareScan({ onNext }: Props) {
  const [scanning, setScanning] = useState(true);
  const { tier, model } = useAppStore();

  useEffect(() => {
    detectHardware().then(() => {
      setTimeout(() => setScanning(false), 800);
    });
  }, []);

  const tierInfo = tier ? TIER_LABELS[tier] : null;

  return (
    <div>
      <h2 style={styles.heading}>Detecting Your Hardware</h2>
      <p style={styles.sub}>We'll pick the best AI model for your machine.</p>

      {scanning ? (
        <div style={styles.scanBox}>
          <div style={styles.spinner} />
          <span style={{ color: "#aaa", marginLeft: 12 }}>Scanning RAM, GPU, disk…</span>
        </div>
      ) : tierInfo ? (
        <div style={styles.resultBox}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div
              style={{ ...styles.tierBadge, background: tierInfo.color + "22", color: tierInfo.color }}
            >
              {tierInfo.label}
            </div>
          </div>
          <div style={styles.modelName}>{tierInfo.model}</div>
          <div style={styles.ramNote}>
            {tier === "tier1" && "✓ 32 GB RAM detected — running the best local model"}
            {tier === "tier2" && "✓ NVIDIA GPU detected — running GPU-accelerated model"}
            {tier === "tier3_en" && "✓ 6-16 GB RAM — using efficient English model"}
            {tier === "tier4" && "⚡ Low resources — routing to ElevenLabs cloud"}
          </div>
          <button style={styles.btn} onClick={onNext}>
            Continue →
          </button>
        </div>
      ) : (
        <div style={{ color: "#ef4444" }}>Detection failed. Please try again.</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 8px", color: "#fff", fontSize: 18, fontWeight: 600 },
  sub: { margin: "0 0 24px", color: "#888", fontSize: 14 },
  scanBox: { display: "flex", alignItems: "center", padding: "20px 0" },
  spinner: {
    width: 20, height: 20, borderRadius: "50%",
    border: "2px solid #6366f1", borderTopColor: "transparent",
    animation: "spin 0.8s linear infinite",
  },
  resultBox: { background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 20 },
  tierBadge: {
    display: "inline-block", padding: "4px 12px", borderRadius: 20,
    fontSize: 13, fontWeight: 600,
  },
  modelName: { color: "#fff", fontSize: 15, fontWeight: 500, marginBottom: 8 },
  ramNote: { color: "#888", fontSize: 13, marginBottom: 20 },
  btn: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
};
