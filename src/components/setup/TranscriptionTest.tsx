import { useState, useRef, useEffect } from "react";
import { startPtt, stopPtt } from "../../lib/tauri";
import { useAppStore } from "../../stores/appStore";

interface Props {
  onNext: () => void;
}

export default function TranscriptionTest({ onNext }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [success, setSuccess]         = useState(false);
  const { streamingWords, lastSegment } = useAppStore();
  const prevSegmentRef = useRef("");

  useEffect(() => {
    if (lastSegment && lastSegment !== prevSegmentRef.current) {
      prevSegmentRef.current = lastSegment;
      setSuccess(true);
    }
  }, [lastSegment]);

  const handleMouseDown = async () => {
    setIsRecording(true);
    await startPtt().catch(() => {});
  };

  const handleMouseUp = async () => {
    await stopPtt().catch(() => {});
    setIsRecording(false);
  };

  const displayText = streamingWords || lastSegment;
  const canContinue = success;

  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      <div style={eyebrow}>Step 5 of 6</div>
      <h2 style={heading}>Try it out</h2>
      <p style={sub}>Focus the text area below, hold the button and speak a few words.</p>

      {/* Textarea */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid " + (success ? "rgba(52,211,153,0.35)" : "var(--border)"),
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
        minHeight: 120,
        marginBottom: 24,
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}>
        {success && (
          <div style={{
            position: "absolute", top: 0, left: 14, right: 14, height: 1,
            background: "linear-gradient(90deg, transparent, var(--c-mint), transparent)",
          }} />
        )}
        <div style={{
          fontSize: 15, color: displayText ? "var(--text)" : "var(--text-4)",
          lineHeight: 1.7, fontStyle: displayText ? "normal" : "italic",
        }}>
          {displayText || "Your words will appear here as you speak…"}
        </div>
      </div>

      {/* Record button */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          {isRecording && (
            <div style={{
              position: "absolute", inset: 0,
              borderRadius: "50%",
              background: "rgba(251,113,133,0.4)",
              animation: "pulse-ring 1s ease-out infinite",
            }} />
          )}
          <button
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchEnd={handleMouseUp}
            style={{
              width: 60, height: 60, borderRadius: "50%",
              background: isRecording
                ? "rgba(251,113,133,0.15)"
                : "var(--surface-2)",
              border: "1px solid " + (isRecording ? "rgba(251,113,133,0.4)" : "var(--border-strong)"),
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
              transition: "all 0.15s",
              userSelect: "none",
              touchAction: "none",
            }}
          >
            {isRecording
              ? <div style={{ width: 14, height: 14, borderRadius: 3, background: "var(--c-rose)" }} />
              : <MicIcon />
            }
          </button>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
            {isRecording ? "Release to finish" : "Hold to record"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
            {isRecording ? "Listening…" : "Press and hold the button while speaking"}
          </div>
        </div>
      </div>

      {/* Success */}
      {success && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
          background: "rgba(52,211,153,0.07)",
          border: "1px solid rgba(52,211,153,0.2)",
          borderRadius: "var(--radius-md)",
          marginBottom: 20,
          fontSize: 13, color: "var(--c-mint)", fontWeight: 500,
        }}>
          <span style={{ fontSize: 16 }}>✓</span>
          Transcription working!
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={onNext}
          disabled={!canContinue}
          style={{
            background: canContinue ? "#f5f5f7" : "rgba(255,255,255,0.07)",
            color: canContinue ? "#0a0a0c" : "var(--text-4)",
            border: "1px solid " + (canContinue ? "rgba(255,255,255,0.8)" : "var(--border)"),
            borderRadius: 10, padding: "10px 24px",
            fontSize: 13, fontWeight: 500,
            cursor: canContinue ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
        >
          Continue
        </button>
        <button
          onClick={onNext}
          style={{
            background: "transparent", border: "none",
            color: "var(--text-3)", fontSize: 13, cursor: "pointer",
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.14em", color: "var(--text-3)",
  fontFamily: "var(--font-mono)", marginBottom: 10,
};
const heading: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 32, fontWeight: 400,
  color: "var(--text)", margin: "0 0 8px", lineHeight: 1.15,
};
const sub: React.CSSProperties = {
  color: "var(--text-3)", fontSize: 13, margin: "0 0 24px", lineHeight: 1.6,
};

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  );
}

import React from "react";
