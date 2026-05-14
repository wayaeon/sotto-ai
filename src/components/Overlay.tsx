import { useAppStore } from "../stores/appStore";

export default function Overlay() {
  const { recordingState, streamingWords, sidecarReady } = useAppStore();

  const label =
    recordingState === "recording"
      ? streamingWords || "Listening…"
      : recordingState === "processing"
        ? "Processing…"
        : sidecarReady
          ? "Ready"
          : "Starting…";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100vw",
        height: "100vh",
        background: "transparent",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "rgba(20,20,20,0.92)",
          color: "#fff",
          borderRadius: 999,
          padding: "10px 24px",
          fontSize: 15,
          fontWeight: 500,
          letterSpacing: 0.2,
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          backdropFilter: "blur(12px)",
          maxWidth: "60vw",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </div>
  );
}
