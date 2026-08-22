import React, { useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  setModel as setModelIpc,
  downloadModel,
  pauseDownloadModel,
  checkDownloads,
} from "../../lib/tauri";

const MODEL_OPTIONS = [
  { value: "nvidia/parakeet-tdt-0.6b-v3", label: "Parakeet TDT 0.6B v3", desc: "Recommended · fast ONNX runtime · ~640 MB · any machine", recommended: true },
  { value: "large-v3-turbo", label: "large-v3-turbo",  desc: "Best Whisper quality · ~3.1 GB · 16GB+ RAM recommended" },
  { value: "medium.en",      label: "medium.en",        desc: "English only · ~1.5 GB · 8GB+ RAM" },
  { value: "medium",         label: "medium",           desc: "Multilingual · ~1.5 GB · 8GB+ RAM" },
  { value: "small",          label: "small",            desc: "Compact · ~460 MB · any machine" },
];

export default function ModelsTab() {
  const { model, tier, setModel, downloadStates } = useAppStore();

  // Pull a fresh download snapshot whenever the tab opens.
  useEffect(() => {
    checkDownloads().catch(() => {});
  }, []);

  const select = (value: string) => {
    setModel(value);
    localStorage.setItem("verba_model", value);
    setModelIpc(value).catch(console.error);
  };

  const start = (value: string) => {
    downloadModel(value).catch(console.error);
  };

  const pause = (value: string) => {
    pauseDownloadModel(value).catch(console.error);
  };

  return (
    <div>
      <h2 style={s.heading}>Models</h2>
      <p style={s.desc}>
        Detected tier: <strong style={{ color: "#a5b4fc" }}>{tier ?? "detecting…"}</strong>
        <span style={{ color: "#555", marginLeft: 8, fontSize: 12 }}>
          Your selection is saved and loads automatically on startup.
        </span>
      </p>
      <div style={s.grid}>
        {MODEL_OPTIONS.map((opt) => {
          const active = model === opt.value;
          const state = downloadStates[opt.value];
          const downloading = Boolean(state?.active) && !state?.paused;
          const pausedDownload = Boolean(state?.paused);
          const downloaded = Boolean(state?.downloaded);
          const percent = state?.percent;
          return (
            <div
              key={opt.value}
              onClick={() => select(opt.value)}
              style={{
                ...s.card,
                borderColor: active ? "#6366f1" : "rgba(255,255,255,0.08)",
                background: active ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={s.modelName}>{opt.label}</div>
                {active && (
                  <span style={s.activeBadge}>Active</span>
                )}
                {(opt as any).recommended && !active && (
                  <span style={s.recommendedBadge}>Default</span>
                )}
                {downloaded && (
                  <span style={s.readyBadge}>Ready</span>
                )}
              </div>
              <div style={s.modelDesc}>{opt.desc}</div>

              {(downloading || pausedDownload) && typeof percent === "number" && (
                <div style={{ marginTop: 8 }}>
                  <div style={s.progressTrack}>
                    <div style={{ ...s.progressFill, width: `${Math.min(100, Math.max(0, percent))}%` }} />
                  </div>
                  <div style={s.progressLabel}>
                    {pausedDownload ? "Paused" : "Downloading"} · {percent.toFixed(1)}%
                  </div>
                </div>
              )}

              {!downloaded && (downloading || pausedDownload ? (
                <button
                  style={s.actionButton}
                  onClick={(e) => { e.stopPropagation(); pause(opt.value); }}
                >
                  Pause
                </button>
              ) : (
                <button
                  style={s.actionButton}
                  onClick={(e) => { e.stopPropagation(); start(opt.value); }}
                >
                  {pausedDownload ? "Resume" : "Download"}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 8px", color: "#fff", fontSize: 20, fontWeight: 600 },
  desc: { margin: "0 0 24px", color: "#888", fontSize: 14 },
  grid: { display: "flex", flexDirection: "column", gap: 8 },
  card: {
    border: "1px solid",
    borderRadius: 10, padding: "12px 16px",
    transition: "border-color 0.15s, background 0.15s",
  },
  modelName: { color: "#fff", fontWeight: 600, fontSize: 14 },
  modelDesc: { color: "#666", fontSize: 13 },
  activeBadge: {
    fontSize: 11, fontWeight: 600, color: "#a5b4fc",
    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: 99, padding: "2px 8px",
  },
  recommendedBadge: {
    fontSize: 11, fontWeight: 600, color: "#888",
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 99, padding: "2px 8px",
  },
  readyBadge: {
    fontSize: 11, fontWeight: 600, color: "#6ee7b7",
    background: "rgba(110,231,183,0.12)", border: "1px solid rgba(110,231,183,0.25)",
    borderRadius: 99, padding: "2px 8px",
  },
  progressTrack: {
    height: 4, borderRadius: 99, overflow: "hidden",
    background: "rgba(255,255,255,0.07)",
  },
  progressFill: {
    height: "100%", borderRadius: 99,
    background: "linear-gradient(90deg, #6366f1, #818cf8)",
    transition: "width 240ms cubic-bezier(.22,1,.36,1)",
  },
  progressLabel: { marginTop: 6, fontSize: 11, color: "#777" },
  actionButton: {
    marginTop: 10, alignSelf: "flex-start",
    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)",
    color: "#a5b4fc", fontSize: 12, fontWeight: 500, borderRadius: 8,
    padding: "6px 14px", cursor: "pointer",
  },
};
