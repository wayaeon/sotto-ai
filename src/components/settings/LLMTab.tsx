import React, { useState } from "react";

function get(key: string, def: string) {
  return localStorage.getItem(key) ?? def;
}

export default function LLMTab() {
  const [enabled, setEnabled] = useState(() => get("verba_llm_enabled", "false") === "true");
  const [url, setUrl]         = useState(() => get("verba_llm_url", "http://localhost:11434"));
  const [model, setModel]     = useState(() => get("verba_llm_model", "qwen3:7b"));
  const [prompt, setPrompt]   = useState(() =>
    get("verba_llm_prompt",
      "Clean up the following voice transcription. Fix punctuation, capitalisation, and obvious speech errors. Return only the corrected text, nothing else.")
  );

  const save = () => {
    localStorage.setItem("verba_llm_enabled", String(enabled));
    localStorage.setItem("verba_llm_url", url);
    localStorage.setItem("verba_llm_model", model);
    localStorage.setItem("verba_llm_prompt", prompt);
  };

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem("verba_llm_enabled", String(next));
  };

  return (
    <div>
      <h2 style={s.heading}>AI Cleanup</h2>
      <p style={s.desc}>
        Run transcriptions through a local LLM via Ollama to fix punctuation and speech errors.
      </p>

      {/* Enable toggle */}
      <div style={s.row} onClick={toggle}>
        <div>
          <div style={s.label}>Enable LLM cleanup</div>
          <div style={s.sub}>Passes each segment through Ollama before injecting text</div>
        </div>
        <Toggle on={enabled} />
      </div>

      {enabled && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Ollama URL" value={url} onChange={v => { setUrl(v); save(); }}
            placeholder="http://localhost:11434" mono />
          <Field label="Model" value={model} onChange={v => { setModel(v); save(); }}
            placeholder="qwen3:7b" mono />
          <div>
            <div style={s.fieldLabel}>System prompt</div>
            <textarea
              value={prompt}
              onChange={e => { setPrompt(e.target.value); save(); }}
              rows={4}
              style={s.textarea}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, color: "#555", fontSize: 12 }}>
        Install Ollama from <span style={{ color: "#6366f1" }}>ollama.com</span> and run{" "}
        <code style={s.code}>ollama pull {model}</code> to get started.
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <div style={s.fieldLabel}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...s.input, fontFamily: mono ? "var(--font-mono, monospace)" : undefined }}
      />
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div style={{
      width: 40, height: 22, borderRadius: 99, flexShrink: 0,
      background: on ? "#7c3aed" : "rgba(255,255,255,0.1)",
      position: "relative", cursor: "pointer",
      boxShadow: on ? "0 0 0 1px rgba(124,58,237,0.4)" : "0 0 0 1px rgba(255,255,255,0.08)",
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        position: "absolute", top: 3,
        transform: on ? "translateX(21px)" : "translateX(3px)",
        transition: "transform 0.2s cubic-bezier(.22,1,.36,1)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
      }} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 8px", color: "#fff", fontSize: 20, fontWeight: 600 },
  desc: { margin: "0 0 20px", color: "#888", fontSize: 14 },
  row: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 18px", gap: 16, cursor: "pointer",
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
  },
  label: { color: "rgba(255,255,255,0.85)", fontSize: 13.5, fontWeight: 500, marginBottom: 2 },
  sub: { color: "rgba(255,255,255,0.3)", fontSize: 12 },
  fieldLabel: { color: "#888", fontSize: 12, fontWeight: 500, marginBottom: 6 },
  input: {
    width: "100%", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
    padding: "9px 12px", color: "#e0e0e0", fontSize: 13,
    boxSizing: "border-box",
  } as React.CSSProperties,
  textarea: {
    width: "100%", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
    padding: "9px 12px", color: "#e0e0e0", fontSize: 13,
    resize: "vertical", fontFamily: "inherit", lineHeight: 1.5,
    boxSizing: "border-box",
  } as React.CSSProperties,
  code: {
    background: "rgba(255,255,255,0.07)", borderRadius: 4,
    padding: "2px 6px", fontFamily: "monospace", color: "#a5b4fc",
  },
};
