export default function HotkeysTab() {
  const hotkeys = [
    { action: "Push-to-talk", key: "Ctrl + Win" },
    { action: "Hands-free toggle", key: "Ctrl + Win + Space" },
  ];

  return (
    <div>
      <h2 style={s.heading}>Hotkeys</h2>
      <p style={s.desc}>Global hotkeys work even when Wispr Local is in the background.</p>
      <div style={s.list}>
        {hotkeys.map((hk) => (
          <div key={hk.action} style={s.row}>
            <span style={s.action}>{hk.action}</span>
            <kbd style={s.kbd}>{hk.key}</kbd>
          </div>
        ))}
      </div>
      <p style={{ color: "#555", fontSize: 12, marginTop: 16 }}>
        Custom hotkey remapping coming in a future release.
      </p>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 8px", color: "#fff", fontSize: 20, fontWeight: 600 },
  desc: { margin: "0 0 24px", color: "#888", fontSize: 14 },
  list: { display: "flex", flexDirection: "column", gap: 2 },
  row: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 20px", background: "rgba(255,255,255,0.03)", borderRadius: 8,
  },
  action: { color: "#ccc", fontSize: 14 },
  kbd: {
    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#a5b4fc", fontFamily: "monospace",
  },
};
