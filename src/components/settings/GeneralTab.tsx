import React, { useState } from "react";

interface Setting {
  key: string;
  label: string;
  sub?: string;
  default: boolean;
}

const SETTINGS: Setting[] = [
  { key: "launch_at_login",   label: "Launch at login",                sub: "Start Sotto automatically when you log in",         default: true  },
  { key: "show_overlay",      label: "Show pill while recording",      sub: "Display the floating pill when transcription is active", default: true  },
  { key: "inject_text",       label: "Inject text into active window", sub: "Type transcribed text directly into the focused field",  default: true  },
  { key: "copy_to_clipboard", label: "Copy to clipboard",             sub: "Also copy each transcription to your clipboard",        default: true  },
];

function getStored(key: string, def: boolean): boolean {
  const v = localStorage.getItem(`sotto_setting_${key}`);
  return v === null ? def : v === "true";
}

export default function GeneralTab() {
  const [values, setValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SETTINGS.map(s => [s.key, getStored(s.key, s.default)]))
  );

  const toggle = (key: string) => {
    setValues(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(`sotto_setting_${key}`, String(next[key]));
      return next;
    });
  };

  return (
    <div>
      <style>{`
        .toggle-track { transition: background 0.2s ease; }
        .toggle-thumb { transition: transform 0.2s cubic-bezier(.22,1,.36,1); }
      `}</style>
      <section style={s.section}>
        {SETTINGS.map((setting, i) => (
          <div
            key={setting.key}
            style={{ ...s.row, borderBottom: i < SETTINGS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
            onClick={() => toggle(setting.key)}
          >
            <div>
              <div style={s.label}>{setting.label}</div>
              {setting.sub && <div style={s.sub}>{setting.sub}</div>}
            </div>
            <Toggle on={values[setting.key]} />
          </div>
        ))}
      </section>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      className="toggle-track"
      style={{
        width: 40, height: 22, borderRadius: 99, flexShrink: 0,
        background: on ? "#7c3aed" : "rgba(255,255,255,0.1)",
        position: "relative", cursor: "pointer",
        boxShadow: on ? "0 0 0 1px rgba(124,58,237,0.4)" : "0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="toggle-thumb"
        style={{
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff",
          position: "absolute", top: 3,
          transform: on ? "translateX(21px)" : "translateX(3px)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  section: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 12, overflow: "hidden",
  },
  row: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 18px", cursor: "pointer", gap: 16,
    transition: "background 0.1s",
  },
  label: { color: "rgba(255,255,255,0.85)", fontSize: 13.5, fontWeight: 500, marginBottom: 2 },
  sub:   { color: "rgba(255,255,255,0.3)",  fontSize: 12 },
};
