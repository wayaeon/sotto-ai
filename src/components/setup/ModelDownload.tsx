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
    if (tier === "tier4") {
      // Cloud tier — no download needed
      setDone(true);
      return;
    }

    const unlisten = onSidecarEvent((msg) => {
      if (msg.event === "download_progress") {
        setProgress(msg.percent);
        if (msg.percent >= 100) setDone(true);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [tier]);

  if (tier === "tier4") {
    return (
      <div>
        <h2 style={s.heading}>Cloud Mode</h2>
        <p style={s.sub}>
          Your machine will use ElevenLabs Scribe v2 for transcription.
          No download needed — you'll need an API key in Settings.
        </p>
        <button style={s.btn} onClick={onNext}>Continue →</button>
      </div>
    );
  }

  return (
    <div>
      <h2 style={s.heading}>Downloading Model</h2>
      <p style={s.sub}>
        Downloading <strong style={{ color: "#fff" }}>{model}</strong> for offline use.
        This only happens once (~1-4 GB).
      </p>

      {done ? (
        <div>
          <div style={s.successMsg}>✓ Model ready</div>
          <button style={s.btn} onClick={onNext}>Continue →</button>
        </div>
      ) : (
        <div>
          <div style={s.progressBar}>
            <div
              style={{
                ...s.progressFill,
                width: progress !== null ? `${progress}%` : "0%",
              }}
            />
          </div>
          <div style={s.progressLabel}>
            {progress !== null ? `${Math.round(progress)}%` : "Starting…"}
          </div>
          <p style={{ color: "#666", fontSize: 12 }}>
            Model will be cached at ~/.wispr-local/models/ for future use.
          </p>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 8px", color: "#fff", fontSize: 18, fontWeight: 600 },
  sub: { margin: "0 0 24px", color: "#888", fontSize: 14 },
  progressBar: {
    height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: { height: "100%", background: "#6366f1", borderRadius: 4, transition: "width 0.3s" },
  progressLabel: { color: "#aaa", fontSize: 13, marginBottom: 16 },
  successMsg: { color: "#22c55e", fontSize: 15, fontWeight: 600, marginBottom: 16 },
  btn: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
};
