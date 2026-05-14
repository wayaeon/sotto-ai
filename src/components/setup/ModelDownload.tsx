import { useEffect, useState } from "react";
import { onSidecarEvent } from "../../lib/tauri";
import { useAppStore } from "../../stores/appStore";

interface Props {
  onNext: () => void;
}

export default function ModelDownload({ onNext }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const { tier, model } = useAppStore();

  useEffect(() => {
    if (tier === "tier4") { setDone(true); return; }

    const unlisten = onSidecarEvent((msg) => {
      if (msg.event === "download_progress") {
        setProgress(msg.percent);
        if (msg.percent >= 100) setDone(true);
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
          Your machine will use ElevenLabs Scribe v2 — no local download needed.
          Add your API key in Settings after setup.
        </p>
        <button style={s.btn} onClick={onNext}>Continue</button>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>

      <div style={s.eyebrow}>Model Setup</div>
      <h2 style={s.heading}>Downloading Model</h2>
      <p style={s.sub}>
        <strong style={{ color: "#fff", fontWeight: 600 }}>{model}</strong>
        {" "}will be downloaded for fully offline use. This only happens once.
      </p>

      {done ? (
        <>
          <div style={s.successBox}>
            <span style={s.checkmark}>✓</span>
            <span>Model ready — no internet needed from here on.</span>
          </div>
          <button style={s.btn} onClick={onNext}>Continue</button>
        </>
      ) : (
        <>
          <div style={s.barTrack}>
            <div style={{ ...s.barFill, width: progress !== null ? `${progress}%` : "0%" }}>
              {/* shimmer when waiting to start */}
              {progress === null && (
                <div style={s.shimmer} />
              )}
            </div>
          </div>
          <div style={s.meta}>
            <span style={s.progressLabel}>
              {progress !== null ? `${Math.round(progress)}%` : "Waiting for AI engine…"}
            </span>
            <span style={s.cacheNote}>~/.sotto/models/</span>
          </div>

          {/* Skip during development — remove before shipping */}
          <button style={s.skipBtn} onClick={onNext}>
            Skip for now (dev)
          </button>
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { width: "100%", maxWidth: 480 },
  eyebrow: { color: "#6366f1", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 },
  heading: { color: "#fff", fontSize: 24, fontWeight: 700, margin: "0 0 8px", lineHeight: 1.2 },
  sub: { color: "rgba(255,255,255,0.35)", fontSize: 13, margin: "0 0 28px", lineHeight: 1.6 },

  barTrack: {
    height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 4,
    overflow: "hidden", marginBottom: 10, position: "relative",
  },
  barFill: {
    height: "100%", background: "linear-gradient(90deg, #6366f1, #a78bfa)",
    borderRadius: 4, transition: "width 0.4s ease", position: "relative", overflow: "hidden",
    minWidth: progress => progress !== null ? undefined : "6%",
  } as React.CSSProperties,
  shimmer: {
    position: "absolute", top: 0, left: 0, width: "40%", height: "100%",
    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
    animation: "shimmer 1.4s infinite",
  },

  meta: { display: "flex", justifyContent: "space-between", marginBottom: 32 },
  progressLabel: { color: "rgba(255,255,255,0.3)", fontSize: 12 },
  cacheNote: { color: "rgba(255,255,255,0.15)", fontSize: 11, fontFamily: "monospace" },

  successBox: {
    display: "flex", alignItems: "center", gap: 10,
    color: "#22c55e", fontSize: 14, marginBottom: 24,
  },
  checkmark: { fontSize: 18, fontWeight: 700 },

  btn: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  skipBtn: {
    background: "transparent", color: "rgba(255,255,255,0.2)", border: "none",
    fontSize: 12, cursor: "pointer", padding: "4px 0", textDecoration: "underline",
    textDecorationColor: "rgba(255,255,255,0.1)",
  },
};
