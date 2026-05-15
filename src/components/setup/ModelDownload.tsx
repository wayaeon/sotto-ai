import { useEffect, useState } from "react";
import { onSidecarEvent, downloadModel } from "../../lib/tauri";
import { useAppStore } from "../../stores/appStore";

const MODEL_SIZES: Record<string, string> = {
  "whisper-large-v3-turbo": "~3.1 GB",
  "moonshine-base": "~100 MB",
  "ElevenLabs Scribe v2": "cloud",
};

interface Props {
  onNext: () => void;
}

export default function ModelDownload({ onNext }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const { tier, model } = useAppStore();

  useEffect(() => {
    if (tier === "tier4") return;

    // Start download and listen for progress
    downloadModel().catch(() => {});

    const unlisten = onSidecarEvent((msg) => {
      if (msg.event === "download_progress") {
        setProgress(msg.percent);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [tier]);

  if (tier === "tier4") {
    return (
      <div style={s.root}>
        <div style={s.eyebrow}>Model Setup</div>
        <h2 style={s.heading}>Cloud Mode</h2>
        <p style={s.sub}>
          Your machine will use <strong style={{ color: "#fff" }}>ElevenLabs Scribe v2</strong> — no
          local download needed. Add your API key in Settings after setup.
        </p>
        <button style={s.btn} onClick={onNext}>Continue</button>
      </div>
    );
  }

  const size = MODEL_SIZES[model ?? ""] ?? "~2 GB";

  return (
    <div style={s.root}>
      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes readyIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={s.eyebrow}>Model Setup</div>
      <h2 style={s.heading}>
        {progress !== null ? "Downloading Model" : "Model Ready"}
      </h2>
      <p style={s.sub}>
        <strong style={{ color: "#fff", fontWeight: 600 }}>{model}</strong>
        {progress !== null
          ? " is downloading for fully offline use."
          : ` (${size}) will download automatically the first time you dictate.`}
      </p>

      {progress !== null ? (
        <>
          <div style={s.barTrack}>
            <div style={{ ...s.barFill, width: `${progress}%` }}>
              {progress < 100 && <div style={s.shimmer} />}
            </div>
          </div>
          <div style={s.meta}>
            <span style={s.progressLabel}>{Math.round(progress)}%</span>
            <span style={s.cacheNote}>~/.sotto/models/</span>
          </div>
          {progress >= 100 && (
            <button style={s.btn} onClick={onNext}>Continue</button>
          )}
        </>
      ) : (
        <div style={{ animation: "readyIn 0.4s ease forwards" }}>
          <div style={s.infoBox}>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>Location</span>
              <span style={s.infoValue}>~/.sotto/models/</span>
            </div>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>Size</span>
              <span style={s.infoValue}>{size}</span>
            </div>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>Connection</span>
              <span style={s.infoValue}>Fully offline after first download</span>
            </div>
          </div>
          <button style={s.btn} onClick={onNext}>Continue</button>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { width: "100%", maxWidth: 480 },
  eyebrow: { color: "#6366f1", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 },
  heading: { color: "#fff", fontSize: 24, fontWeight: 700, margin: "0 0 8px", lineHeight: 1.2 },
  sub: { color: "rgba(255,255,255,0.35)", fontSize: 13, margin: "0 0 24px", lineHeight: 1.6 },

  infoBox: {
    background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.18)",
    borderRadius: 10, padding: "14px 16px", marginBottom: 24,
    display: "flex", flexDirection: "column", gap: 10,
  },
  infoRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  infoLabel: { color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 },
  infoValue: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "monospace" },

  barTrack: {
    height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 4,
    overflow: "hidden", marginBottom: 10, position: "relative",
  },
  barFill: {
    height: "100%", background: "linear-gradient(90deg, #6366f1, #a78bfa)",
    borderRadius: 4, transition: "width 0.4s ease", position: "relative", overflow: "hidden",
  },
  shimmer: {
    position: "absolute", top: 0, left: 0, width: "40%", height: "100%",
    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
    animation: "shimmer 1.4s infinite",
  },

  meta: { display: "flex", justifyContent: "space-between", marginBottom: 24 },
  progressLabel: { color: "rgba(255,255,255,0.3)", fontSize: 12 },
  cacheNote: { color: "rgba(255,255,255,0.15)", fontSize: 11, fontFamily: "monospace" },

  btn: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
};
