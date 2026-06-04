import { useEffect, useState } from "react";
import { onSidecarEvent, downloadModel } from "../../lib/tauri";
import { useAppStore } from "../../stores/appStore";

const MODEL_SIZES: Record<string, string> = {
  "large-v3-turbo": "3.1 GB",
  "medium.en":      "1.5 GB",
  "medium":         "1.5 GB",
  "small":          "460 MB",
  "base":           "145 MB",
  "tiny":           "75 MB",
};

interface Props {
  onNext: () => void;
}

type Phase = "approve" | "downloading" | "done";

const NEEDS_TOKEN = ["large-v3-turbo"];

export default function ModelDownload({ onNext }: Props) {
  const [phase, setPhase] = useState<Phase>("approve");
  const [progress, setProgress] = useState(0);
  const [token, setToken] = useState(() => localStorage.getItem("sotto_hf_token") ?? "");
  const { model } = useAppStore();

  const modelName = model ?? "medium.en";
  const size = MODEL_SIZES[modelName] ?? "~2 GB";
  const needsToken = NEEDS_TOKEN.includes(modelName);

  useEffect(() => {
    const unlisten = onSidecarEvent((msg) => {
      if (msg.event === "download_progress") {
        setProgress(msg.percent);
        if (msg.percent >= 100) setPhase("done");
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const startDownload = () => {
    if (token) localStorage.setItem("sotto_hf_token", token);
    setPhase("downloading");
    setProgress(0);
    downloadModel(modelName, token || undefined).catch(() => {});
  };

  return (
    <div style={s.root}>
      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes doneIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={s.eyebrow}>AI Model</div>

      {phase === "approve" && (
        <>
          <h2 style={s.heading}>Download your model</h2>
          <p style={s.sub}>
            Sotto will download <strong style={{ color: "var(--text)" }}>{modelName}</strong> for
            fully offline dictation. This is a one-time download.
          </p>

          <div style={s.infoBox}>
            <Row label="Model"      value={modelName} />
            <Row label="Size"       value={size} />
            <Row label="Stored at"  value="~/.sotto/models/" mono />
            <Row label="Network"    value="HuggingFace CDN (anonymous)" />
          </div>

          {needsToken && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "var(--text-4)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
                HuggingFace token <span style={{ color: "var(--c-rose)", fontWeight: 400 }}>(required for this model)</span>
              </div>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="hf_xxxxxxxxxxxxxxxx"
                style={s.tokenInput}
              />
              <div style={{ color: "var(--text-4)", fontSize: 11, marginTop: 5 }}>
                Free at huggingface.co → Settings → Access Tokens
              </div>
            </div>
          )}

          <button
            style={{ ...s.btnPrimary, opacity: needsToken && !token ? 0.4 : 1 }}
            onClick={startDownload}
            disabled={needsToken && !token}
          >
            Download now
          </button>
        </>
      )}

      {phase === "downloading" && (
        <>
          <h2 style={s.heading}>Downloading…</h2>
          <p style={s.sub}>
            <strong style={{ color: "var(--text)" }}>{modelName}</strong> · {size} ·{" "}
            <span style={{ color: "var(--text-4)" }}>{Math.round(progress)}%</span>
          </p>

          <div style={s.barTrack}>
            <div style={{ ...s.barFill, width: `${progress}%` }}>
              <div style={s.shimmer} />
            </div>
          </div>

          <div style={{ color: "var(--text-4)", fontSize: 12, marginTop: 10 }}>
            Keep this window open while downloading.
          </div>
        </>
      )}

      {phase === "done" && (
        <div style={{ animation: "doneIn 0.4s ease forwards" }}>
          <h2 style={s.heading}>Model ready</h2>
          <p style={s.sub}>
            <strong style={{ color: "var(--text)" }}>{modelName}</strong> is installed and ready for
            offline dictation.
          </p>

          <div style={s.barTrack}>
            <div style={{ ...s.barFill, width: "100%", background: "var(--c-mint)" }} />
          </div>

          <button style={{ ...s.btnPrimary, marginTop: 28 }} onClick={onNext}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={s.rowLabel}>{label}</span>
      <span style={{ ...s.rowValue, fontFamily: mono ? "var(--font-mono)" : undefined }}>{value}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { width: "100%", maxWidth: 480 },
  eyebrow: {
    color: "#6366f1", fontSize: 11, fontWeight: 700,
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10,
  },
  heading: { color: "var(--text)", fontSize: 28, fontWeight: 600, margin: "0 0 8px", lineHeight: 1.2 },
  sub: { color: "var(--text-3)", fontSize: 13, margin: "0 0 24px", lineHeight: 1.65 },

  infoBox: {
    background: "rgba(99,102,241,0.06)",
    border: "1px solid rgba(99,102,241,0.16)",
    borderRadius: 10, padding: "14px 16px", marginBottom: 24,
    display: "flex", flexDirection: "column", gap: 10,
  },
  rowLabel: { color: "var(--text-4)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 },
  rowValue: { color: "var(--text-2)", fontSize: 12 },

  barTrack: {
    height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 4,
    overflow: "hidden", position: "relative",
  },
  barFill: {
    height: "100%",
    background: "linear-gradient(90deg, #6366f1, #a78bfa)",
    borderRadius: 4,
    transition: "width 0.5s ease",
    position: "relative", overflow: "hidden",
  },
  shimmer: {
    position: "absolute", top: 0, left: 0, width: "40%", height: "100%",
    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
    animation: "shimmer 1.4s infinite",
  },

  btnPrimary: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  tokenInput: {
    width: "100%", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
    padding: "9px 12px", color: "var(--text)", fontSize: 13,
    fontFamily: "var(--font-mono)", boxSizing: "border-box",
  } as React.CSSProperties,
};
