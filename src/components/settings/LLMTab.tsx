import React, { useState } from "react";
import { DEFAULT_LLM_MODEL, DEFAULT_LLM_PROMPT } from "../../lib/llmCleanup";
import { openUrl } from "../../lib/tauri";

function get(key: string, def: string) {
  return localStorage.getItem(key) ?? def;
}

export default function LLMTab() {
  const [enabled, setEnabled] = useState(() => get("verba_llm_enabled", "false") === "true");
  const [apiKey, setApiKey]   = useState(() => get("verba_llm_api_key", ""));
  const [model, setModel]     = useState(() => get("verba_llm_model", DEFAULT_LLM_MODEL));
  const [prompt, setPrompt]   = useState(() => get("verba_llm_prompt", DEFAULT_LLM_PROMPT));

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem("verba_llm_enabled", String(next));
  };

  return (
    <div>
      <h2 style={s.heading}>AI Cleanup</h2>
      <p style={s.desc}>
        Run transcriptions through OpenRouter to fix punctuation and speech errors before
        they are typed. If a request fails, the raw transcript is used instead.
      </p>

      {/* Enable toggle */}
      <div style={s.row} onClick={toggle}>
        <div>
          <div style={s.label}>Enable AI cleanup</div>
          <div style={s.sub}>Passes each segment through OpenRouter before injecting text</div>
        </div>
        <Toggle on={enabled} />
      </div>

      {enabled && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="OpenRouter API key" value={apiKey} onChange={v => { setApiKey(v); localStorage.setItem("verba_llm_api_key", v); }}
            placeholder="sk-or-v1-…" mono password />
          <Field label="Model" value={model} onChange={v => { setModel(v); saveModel(v); }}
            placeholder={DEFAULT_LLM_MODEL} mono />
          <div>
            <div style={s.fieldLabel}>System prompt</div>
            <textarea
              value={prompt}
              onChange={e => { setPrompt(e.target.value); localStorage.setItem("verba_llm_prompt", e.target.value); }}
              rows={4}
              style={s.textarea}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, color: "#555", fontSize: 12 }}>
        Create a key at{" "}
        <span style={{ color: "#6366f1", cursor: "pointer" }} onClick={() => openUrl("https://openrouter.ai/keys")}>
          openrouter.ai/keys
        </span>{" "}
        — it is stored locally on this machine and sent only to OpenRouter.
      </div>
    </div>
  );
}

function saveModel(value: string) {
  localStorage.setItem("verba_llm_model", value.trim() || DEFAULT_LLM_MODEL);
}

function Field({ label, value, onChange, placeholder, mono, password }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; password?: boolean;
}) {
  return (
    <div>
      <div style={s.fieldLabel}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        type={password ? "password" : "text"}
        autoComplete="off"
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
};
