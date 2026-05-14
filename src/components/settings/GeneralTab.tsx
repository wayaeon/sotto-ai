export default function GeneralTab() {
  return (
    <div>
      <h2 style={s.heading}>General</h2>
      <section style={s.section}>
        <div style={s.row}>
          <label style={s.label}>Launch at login</label>
          <input type="checkbox" defaultChecked />
        </div>
        <div style={s.row}>
          <label style={s.label}>Show overlay while recording</label>
          <input type="checkbox" defaultChecked />
        </div>
        <div style={s.row}>
          <label style={s.label}>Inject text into active window</label>
          <input type="checkbox" defaultChecked />
        </div>
        <div style={s.row}>
          <label style={s.label}>Copy to clipboard</label>
          <input type="checkbox" defaultChecked />
        </div>
      </section>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 24px", color: "#fff", fontSize: 20, fontWeight: 600 },
  section: { background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "4px 0" },
  row: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  label: { color: "#ccc", fontSize: 14 },
};
