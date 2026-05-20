import React from "react";
import { useAppStore } from "../../stores/appStore";
import { setModel as setModelIpc } from "../../lib/tauri";

const MODEL_OPTIONS = [
  { value: "large-v3-turbo", label: "large-v3-turbo",  desc: "Best quality · ~3.1 GB · 16GB+ RAM recommended" },
  { value: "medium.en",      label: "medium.en",        desc: "English only · ~1.5 GB · 8GB+ RAM" },
  { value: "medium",         label: "medium",           desc: "Multilingual · ~1.5 GB · 8GB+ RAM" },
  { value: "small",          label: "small",            desc: "Compact · ~460 MB · any machine" },
];

export default function ModelsTab() {
  const { model, tier, setModel } = useAppStore();

  const select = (value: string) => {
    setModel(value);
    localStorage.setItem("sotto_model", value);
    setModelIpc(value).catch(console.error);
  };

  return (
    <div>
      <h2 style={s.heading}>Models</h2>
      <p style={s.desc}>
        Detected tier: <strong style={{ color: "#a5b4fc" }}>{tier ?? "detecting…"}</strong>
        <span style={{ color: "#555", marginLeft: 8, fontSize: 12 }}>
          Model changes take effect on next recording.
        </span>
      </p>
      <div style={s.grid}>
        {MODEL_OPTIONS.map((opt) => {
          const active = model === opt.value;
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
              </div>
              <div style={s.modelDesc}>{opt.desc}</div>
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
};
