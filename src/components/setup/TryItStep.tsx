import { useEffect, useRef, useState } from "react";
import { startPtt, stopPtt } from "../../lib/tauri";
import { useAppStore } from "../../stores/appStore";

interface Props {
  onComplete: () => void;
}

type Phase = "idle" | "recording" | "processing" | "done";

export default function TryItStep({ onComplete }: Props) {
  const { lastSegment, lastError, setLastError } = useAppStore();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState("");
  const baseline = useRef(lastSegment);
  const recording = useRef(false);

  useEffect(() => {
    if ((phase === "recording" || phase === "processing") && lastSegment && lastSegment !== baseline.current) {
      setResult(lastSegment);
      setPhase("done");
    }
  }, [lastSegment, phase]);

  const begin = () => {
    if (recording.current || phase === "processing") return;
    baseline.current = lastSegment;
    recording.current = true;
    setLastError(null);
    setPhase("recording");
    startPtt().catch((error) => {
      recording.current = false;
      setPhase("idle");
      setLastError(String(error));
    });
  };

  const end = () => {
    if (!recording.current) return;
    recording.current = false;
    setPhase("processing");
    stopPtt().catch((error) => {
      setPhase("idle");
      setLastError(String(error));
    });
  };

  return (
    <div style={shell}>
      <div style={eyebrow}>Try it</div>
      <h2 style={heading}>Say something short</h2>
      <p style={sub}>Hold the button, speak naturally, then release. This confirms the full local path before you reach the dashboard.</p>

      <button
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        disabled={phase === "processing"}
        style={phase === "recording" ? recordingButton : actionButton}
      >
        {phase === "recording" ? "Release when finished" : phase === "processing" ? "Transcribing…" : "Hold to dictate"}
      </button>

      {lastError && <div style={errorBox}>{lastError}</div>}
      {result && (
        <div style={resultBox}>
          <div style={resultLabel}>Captured locally</div>
          <div style={resultText}>{result}</div>
          <button onClick={onComplete} style={primaryButton}>Open dashboard</button>
        </div>
      )}
    </div>
  );
}

const shell: React.CSSProperties = { width: "100%", maxWidth: 480, textAlign: "center" };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-3)", fontFamily: "var(--font-mono)", marginBottom: 10 };
const heading: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 400, color: "var(--text)", margin: "0 0 8px", lineHeight: 1.15 };
const sub: React.CSSProperties = { color: "var(--text-3)", fontSize: 13, margin: "0 auto 28px", lineHeight: 1.6, maxWidth: 400 };
const actionButton: React.CSSProperties = { background: "#f5f5f7", color: "#0a0a0c", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 12, padding: "14px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const recordingButton: React.CSSProperties = { ...actionButton, background: "var(--c-violet)", color: "#fff", borderColor: "var(--c-violet)" };
const errorBox: React.CSSProperties = { marginTop: 18, color: "var(--c-rose)", fontSize: 12, lineHeight: 1.5 };
const resultBox: React.CSSProperties = { marginTop: 24, padding: 16, textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)" };
const resultLabel: React.CSSProperties = { color: "var(--c-mint)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 };
const resultText: React.CSSProperties = { color: "var(--text)", fontSize: 14, lineHeight: 1.5, marginBottom: 16 };
const primaryButton: React.CSSProperties = { background: "#f5f5f7", color: "#0a0a0c", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer" };
