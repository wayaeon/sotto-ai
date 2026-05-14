import { useState } from "react";
import GeneralTab from "./GeneralTab";
import ModelsTab from "./ModelsTab";
import HotkeysTab from "./HotkeysTab";
import CloudTab from "./CloudTab";
import HistoryTab from "./HistoryTab";
import LicenseTab from "./LicenseTab";

type Tab = "general" | "models" | "hotkeys" | "cloud" | "history" | "license";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "models", label: "Models" },
  { id: "hotkeys", label: "Hotkeys" },
  { id: "cloud", label: "Cloud" },
  { id: "history", label: "History" },
  { id: "license", label: "License" },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("general");

  return (
    <div style={s.root}>
      <div style={s.sidebar}>
        <div style={s.sidebarTitle}>Settings</div>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            style={{
              ...s.tabBtn,
              background: activeTab === tab.id ? "rgba(99,102,241,0.2)" : "transparent",
              color: activeTab === tab.id ? "#a5b4fc" : "#888",
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={s.content}>
        {activeTab === "general" && <GeneralTab />}
        {activeTab === "models" && <ModelsTab />}
        {activeTab === "hotkeys" && <HotkeysTab />}
        {activeTab === "cloud" && <CloudTab />}
        {activeTab === "history" && <HistoryTab />}
        {activeTab === "license" && <LicenseTab />}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: "flex", width: "100vw", height: "100vh",
    background: "#0f0f17", fontFamily: "system-ui, sans-serif", color: "#e0e0e0",
  },
  sidebar: {
    width: 160, background: "#13131f", borderRight: "1px solid rgba(255,255,255,0.06)",
    padding: "24px 0", display: "flex", flexDirection: "column",
  },
  sidebarTitle: {
    fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase",
    letterSpacing: 1, padding: "0 16px", marginBottom: 8,
  },
  tabBtn: {
    display: "block", width: "100%", textAlign: "left", padding: "8px 16px",
    border: "none", cursor: "pointer", fontSize: 14, borderRadius: 6, margin: "1px 0",
  },
  content: { flex: 1, padding: "32px 40px", overflowY: "auto" },
};
