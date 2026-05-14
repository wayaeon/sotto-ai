import { useState } from "react";

export default function CloudTab() {
  const [elevenKey, setElevenKey] = useState(localStorage.getItem("wispr_elevenlabs_key") ?? "");
  const [anthropicKey, setAnthropicKey] = useState(localStorage.getItem("wispr_anthropic_key") ?? "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem("wispr_elevenlabs_key", elevenKey);
    localStorage.setItem("wispr_anthropic_key", anthropicKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h2 style={s.heading}>Cloud API Keys</h2>
      <p style={s.desc}>
        Keys are stored locally and never transmitted to our servers.
        Required only if using cloud STT or LLM cleanup.
      </p>

      <div style={s.field}>
        <label style={s.label}>ElevenLabs API Key</label>
        <p style={s.sub}>For ElevenLabs Scribe v2 cloud STT</p>
        <input
          type="password"
          style={s.input}
          placeholder="sk_..."
          value={elevenKey}
          onChange={(e) => setElevenKey(e.target.value)}
        />
      </div>

      <div style={s.field}>
        <label style={s.label}>Anthropic API Key</label>
        <p style={s.sub}>For Claude Haiku 4.5 LLM cleanup</p>
        <input
          type="password"
          style={s.input}
          placeholder="sk-ant-..."
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
        />
      </div>

      <button style={s.btn} onClick={save}>
        {saved ? "✓ Saved" : "Save Keys"}
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 8px", color: "#fff", fontSize: 20, fontWeight: 600 },
  desc: { margin: "0 0 24px", color: "#888", fontSize: 14 },
  field: { marginBottom: 24 },
  label: { display: "block", color: "#ccc", fontSize: 14, fontWeight: 600, marginBottom: 4 },
  sub: { margin: "0 0 8px", color: "#555", fontSize: 12 },
  input: {
    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, color: "#fff", fontSize: 14, padding: "10px 14px",
    boxSizing: "border-box", outline: "none",
  },
  btn: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
};
