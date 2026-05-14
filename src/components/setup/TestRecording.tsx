import { useState } from "react";
import { startPtt, stopPtt } from "../../lib/tauri";
import { useAppStore } from "../../stores/appStore";

interface Props {
  onNext: () => void;
}

export default function TestRecording({ onNext }: Props) {
  const [testing, setTesting] = useState(false);
  const { streamingWords, lastSegment } = useAppStore();

  const handleStartTest = async () => {
    setTesting(true);
    await startPtt();
  };

  const handleStopTest = async () => {
    await stopPtt();
    setTesting(false);
  };

  return (
    <div>
      <h2 style={s.heading}>Test Your Microphone</h2>
      <p style={s.sub}>
        Hold the button and say something. You should see words appear in real-time.
      </p>

      <div style={s.testArea}>
        {streamingWords || lastSegment ? (
          <div style={s.transcript}>
            {streamingWords || lastSegment}
          </div>
        ) : (
          <div style={s.placeholder}>Your words will appear here…</div>
        )}
      </div>

      <div style={s.controls}>
        <button
          style={{
            ...s.recordBtn,
            background: testing ? "#ef4444" : "#6366f1",
          }}
          onMouseDown={handleStartTest}
          onMouseUp={handleStopTest}
          onTouchStart={handleStartTest}
          onTouchEnd={handleStopTest}
        >
          {testing ? "🔴 Release to stop" : "🎙 Hold to speak"}
        </button>
      </div>

      {lastSegment && (
        <div style={s.successRow}>
          <span style={{ color: "#22c55e" }}>✓ Transcription working!</span>
          <button style={s.skipBtn} onClick={onNext}>
            Looks good →
          </button>
        </div>
      )}

      <button style={s.ghostBtn} onClick={onNext}>
        Skip test
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 8px", color: "#fff", fontSize: 18, fontWeight: 600 },
  sub: { margin: "0 0 20px", color: "#888", fontSize: 14 },
  testArea: {
    background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "16px 20px",
    minHeight: 60, marginBottom: 20, display: "flex", alignItems: "center",
  },
  transcript: { color: "#fff", fontSize: 16, lineHeight: 1.5 },
  placeholder: { color: "#555", fontSize: 14, fontStyle: "italic" },
  controls: { marginBottom: 16 },
  recordBtn: {
    color: "#fff", border: "none", borderRadius: 8,
    padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer",
    userSelect: "none", touchAction: "none",
  },
  successRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  skipBtn: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent", color: "#555", border: "none",
    fontSize: 13, cursor: "pointer", padding: "4px 0",
  },
};
