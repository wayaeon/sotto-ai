import { useEffect, useState } from "react";

interface Transcription {
  id: number;
  text: string;
  created_at: string;
  duration_ms: number;
}

export default function HistoryTab() {
  const [items, setItems] = useState<Transcription[]>([]);

  useEffect(() => {
    // Placeholder — SQLite queries via tauri-plugin-sql will be wired in Task 13
    // For now show last session from localStorage
    const stored = localStorage.getItem("wispr_recent_transcriptions");
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  if (items.length === 0) {
    return (
      <div>
        <h2 style={s.heading}>Transcription History</h2>
        <div style={s.empty}>
          <div style={s.emptyIcon}>📋</div>
          <p style={s.emptyText}>No transcriptions yet.</p>
          <p style={s.emptyHint}>
            Use Ctrl+Win to dictate — your transcriptions will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={s.heading}>Transcription History</h2>
      <div style={s.list}>
        {items.map((item) => (
          <div key={item.id} style={s.item}>
            <div style={s.text}>{item.text}</div>
            <div style={s.meta}>
              {new Date(item.created_at).toLocaleString()} ·{" "}
              {(item.duration_ms / 1000).toFixed(1)}s
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: "0 0 24px", color: "#fff", fontSize: 20, fontWeight: 600 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  item: {
    background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 16px",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  text: { color: "#e0e0e0", fontSize: 14, marginBottom: 6, lineHeight: 1.5 },
  meta: { color: "#555", fontSize: 12 },
  empty: { textAlign: "center", padding: "60px 0" },
  emptyIcon: { fontSize: 40, marginBottom: 16 },
  emptyText: { color: "#666", fontSize: 16, margin: "0 0 8px" },
  emptyHint: { color: "#444", fontSize: 13 },
};
