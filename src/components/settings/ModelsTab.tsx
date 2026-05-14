import { useAppStore } from "../../stores/appStore";

const MODEL_OPTIONS = [
  { value: "whisper-large-v3-turbo", label: "whisper-large-v3-turbo", desc: "Best quality, ~800MB, 32GB+ RAM" },
  { value: "moonshine-base", label: "moonshine-base", desc: "Fast, English only, ~200MB" },
  { value: "whisper-medium", label: "whisper-medium", desc: "Balanced, multilingual, ~400MB" },
  { value: "cloud", label: "ElevenLabs Scribe (cloud)", desc: "Best accuracy, requires API key" },
];

export default function ModelsTab() {
  const { model, tier } = useAppStore();

  return (
    <div>
      <h2 style={s.heading}>Models</h2>
      <p style={s.desc}>
        Current tier: <strong style={{ color: "#a5b4fc" }}>{tier ?? "detecting…"}</strong>
      </p>
      <div style={s.grid}>
        {MODEL_OPTIONS.map((opt) => (
          <div
            key={opt.value}
            style={{
              ...s.card,
              borderColor: model === opt.value ? "#6366f1" : "rgba(255,255,255,0.08)",
            }}
          >
            <div style={s.modelName}>{opt.label}</div>
            <div style={s.modelDesc}>{opt.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 8px", color: "#fff", fontSize: 20, fontWeight: 600 },
  desc: { margin: "0 0 24px", color: "#888", fontSize: 14 },
  grid: { display: "flex", flexDirection: "column", gap: 8 },
  card: {
    background: "rgba(255,255,255,0.04)", border: "1px solid",
    borderRadius: 10, padding: "12px 16px",
  },
  modelName: { color: "#fff", fontWeight: 600, fontSize: 14, marginBottom: 4 },
  modelDesc: { color: "#666", fontSize: 13 },
};
