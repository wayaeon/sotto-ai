interface Props {
  onComplete: () => void;
}

export default function ReadyScreen({ onComplete }: Props) {
  return (
    <div style={{
      width: "100%", maxWidth: 480,
      textAlign: "center",
      animation: "fadeInReady 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards",
    }}>
      <style>{`
        @keyframes fadeInReady {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Icon */}
      <div style={{
        width: 72, height: 72, borderRadius: 22,
        margin: "0 auto 28px",
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: "var(--grad-spectrum)",
        }} />
        <span style={{ fontSize: 32 }}>🎙</span>
      </div>

      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.14em", color: "var(--text-3)",
        fontFamily: "var(--font-mono)", marginBottom: 12,
      }}>
        Setup complete
      </div>

      <h1 style={{
        fontFamily: "var(--font-display)",
        fontSize: 42, lineHeight: 1,
        letterSpacing: "-0.015em",
        fontWeight: 400,
        color: "var(--text)",
        marginBottom: 16,
      }}>
        You're all set
      </h1>

      <p style={{
        color: "var(--text-2)", fontSize: 15, lineHeight: 1.65,
        marginBottom: 32, maxWidth: 380, margin: "0 auto 32px",
      }}>
        Sotto is running. Focus any text field and hold the hotkey to start dictating.
      </p>

      {/* Hotkey display */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "10px 18px",
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-md)",
        marginBottom: 32,
      }}>
        {["Ctrl", "Shift", "F9"].map((k, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <kbd style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderBottom: "2px solid rgba(255,255,255,0.06)",
              borderRadius: 7, padding: "5px 10px",
              fontSize: 12, fontWeight: 600,
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
            }}>
              {k}
            </kbd>
            {i < 2 && <span style={{ color: "var(--text-4)", fontSize: 12 }}>+</span>}
          </span>
        ))}
      </div>

      <div>
        <button
          onClick={onComplete}
          style={{
            background: "#f5f5f7",
            color: "#0a0a0c",
            border: "1px solid rgba(255,255,255,0.8)",
            borderRadius: 10, padding: "11px 28px",
            fontSize: 14, fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}
