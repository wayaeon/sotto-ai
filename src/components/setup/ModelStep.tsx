import { useAppStore } from "../../stores/appStore";
import { setModel } from "../../lib/tauri";

interface Props {
  onNext: () => void;
}

const DEFAULT_MODEL = "nvidia/parakeet-tdt-0.6b-v3";

export default function ModelStep({ onNext }: Props) {
  const { sidecarReady, modelReady, modelDownload, lastError, setLastError } = useAppStore();
  const canContinue = sidecarReady && modelReady;

  const retry = () => {
    setLastError(null);
    setModel(DEFAULT_MODEL).catch((error) => setLastError(String(error)));
  };

  return (
    <div style={shell}>
      <div style={eyebrow}>Transcription model</div>
      <h2 style={heading}>Parakeet is your Windows engine</h2>
      <p style={sub}>Verba keeps Parakeet downloaded locally. It loads the worker only when you dictate, keeping idle memory use low.</p>

      <div style={card}>
        <div style={modelIcon}>◈</div>
        <div style={{ flex: 1 }}>
          <div style={title}>Parakeet TDT 0.6B v3</div>
          <div style={rowSub}>Local, fast, and tuned for Windows dictation.</div>
          {modelDownload && !modelReady && (
            <div style={download}>
              Downloading Parakeet — {Math.round(modelDownload.percent)}% · {modelDownload.downloadedLabel} / {modelDownload.totalLabel}
            </div>
          )}
        </div>
        <span style={canContinue ? checkBadge : statusBadge}>
          {canContinue ? "✓ Ready" : modelDownload ? "Downloading" : sidecarReady ? "Warming" : "Starting"}
        </span>
      </div>

      {lastError && (
        <div style={errorBox}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Model startup needs a retry</div>
          <div>{lastError}</div>
          <button onClick={retry} style={retryButton}>Retry model</button>
        </div>
      )}

      {!lastError && !canContinue && (
        <div style={hint}>{modelDownload ? "This one-time download is about 640 MB. Verba will load it automatically when it finishes." : "Preparing the local transcription engine…"}</div>
      )}

      <button onClick={onNext} disabled={!canContinue} style={canContinue ? primaryButton : disabledButton}>
        Continue to a quick test
      </button>
    </div>
  );
}

const shell: React.CSSProperties = { width: "100%", maxWidth: 480 };
const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em",
  color: "var(--text-3)", fontFamily: "var(--font-mono)", marginBottom: 10,
};
const heading: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 400,
  color: "var(--text)", margin: "0 0 8px", lineHeight: 1.15,
};
const sub: React.CSSProperties = { color: "var(--text-3)", fontSize: 13, margin: "0 0 24px", lineHeight: 1.6 };
const card: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14, padding: 16,
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)",
};
const modelIcon: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--c-violet)", background: "rgba(167,139,250,0.12)", fontSize: 20,
};
const title: React.CSSProperties = { color: "var(--text)", fontSize: 14, fontWeight: 600, marginBottom: 4 };
const rowSub: React.CSSProperties = { color: "var(--text-3)", fontSize: 12 };
const download: React.CSSProperties = { color: "var(--c-amber)", fontSize: 11, marginTop: 6, fontVariantNumeric: "tabular-nums" };
const checkBadge: React.CSSProperties = {
  color: "var(--c-mint)", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
  borderRadius: 99, padding: "3px 8px", fontSize: 11, fontWeight: 600,
};
const statusBadge: React.CSSProperties = {
  color: "var(--c-amber)", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)",
  borderRadius: 99, padding: "3px 8px", fontSize: 11, fontWeight: 600,
};
const hint: React.CSSProperties = { color: "var(--text-4)", fontSize: 12, margin: "18px 0", lineHeight: 1.5 };
const errorBox: React.CSSProperties = {
  marginTop: 16, padding: 14, color: "var(--c-rose)", background: "rgba(251,113,133,0.08)",
  border: "1px solid rgba(251,113,133,0.2)", borderRadius: "var(--radius-card)", fontSize: 12, lineHeight: 1.5,
};
const retryButton: React.CSSProperties = {
  display: "block", marginTop: 10, background: "transparent", color: "var(--text)",
  border: "1px solid var(--border-strong)", borderRadius: 8, padding: "7px 12px", cursor: "pointer",
};
const primaryButton: React.CSSProperties = {
  background: "#f5f5f7", color: "#0a0a0c", border: "1px solid rgba(255,255,255,0.8)",
  borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 500, cursor: "pointer",
};
const disabledButton: React.CSSProperties = { ...primaryButton, background: "rgba(255,255,255,0.07)", color: "var(--text-4)", borderColor: "var(--border)", cursor: "not-allowed" };
