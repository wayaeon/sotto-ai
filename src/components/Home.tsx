import { useState, useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { getTranscriptions, type Transcription } from "../lib/db";
import { supabase } from "../lib/supabase";
import GeneralTab from "./settings/GeneralTab";
import ModelsTab from "./settings/ModelsTab";
import HotkeysTab from "./settings/HotkeysTab";
import CloudTab from "./settings/CloudTab";
import LicenseTab from "./settings/LicenseTab";

type View = "overview" | "history" | "settings" | "account";
type SettingsTab = "general" | "audio" | "hotkeys" | "ai" | "privacy";

function getMetrics() {
  return {
    totalWords: parseInt(localStorage.getItem("sotto_total_words") ?? "0"),
    sessions:   parseInt(localStorage.getItem("sotto_sessions")   ?? "0"),
    streak:     parseInt(localStorage.getItem("sotto_streak")     ?? "0"),
    avgWpm:     parseInt(localStorage.getItem("sotto_avg_wpm")    ?? "0"),
    totalMs:    parseInt(localStorage.getItem("sotto_total_ms")   ?? "0"),
  };
}

function fmtWords(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function fmtTime(ms: number) {
  const secs = Math.round(ms / 1000);
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}

function timeSaved(totalWords: number) {
  const savedMins = Math.max(0, totalWords / 40 - totalWords / 130);
  return fmtTime(Math.round(savedMins * 60) * 1000);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* ── Root ── */

export default function Home() {
  const [view, setView]           = useState<View>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [userName, setUserName]   = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const name = data.session?.user?.user_metadata?.full_name
        ?? data.session?.user?.email?.split("@")[0]
        ?? "";
      setUserName(name);
    });
  }, []);

  const W = collapsed ? 64 : 232;

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-window)" }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .nav-item:hover { background: rgba(255,255,255,0.04) !important; color: var(--text-2) !important; }
        .history-row:hover { background: var(--surface-2) !important; }
        .collapse-btn:hover { background: rgba(255,255,255,0.05) !important; }
        .copy-btn:hover { background: rgba(255,255,255,0.08) !important; }
        .plan-card:hover { border-color: var(--border-strong) !important; }
      `}</style>

      {/* Sidebar */}
      <aside style={{
        width: W, minWidth: W,
        display: "flex", flexDirection: "column",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        transition: "width 0.22s cubic-bezier(.22,1,.36,1), min-width 0.22s cubic-bezier(.22,1,.36,1)",
        overflow: "hidden",
        padding: "16px 10px 14px",
      }}>
        {/* Brand */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "0 4px", marginBottom: 24,
          justifyContent: collapsed ? "center" : "flex-start",
        }}>
          {/* Logo mark with spectrum gradient border */}
          <div style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: "var(--surface-2)",
            padding: 1.5,
            backgroundImage: "var(--grad-spectrum)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: "100%", height: "100%", borderRadius: 7.5,
              background: "var(--surface)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              <img src="/Sotto Icon.png" style={{ width: 26, height: 26, borderRadius: 6 }} alt="" />
            </div>
          </div>
          {!collapsed && (
            <span style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: 18,
              fontWeight: 400,
              backgroundImage: "var(--grad-spectrum)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              whiteSpace: "nowrap",
            }}>Sotto</span>
          )}
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {([
            { id: "overview" as View, icon: <HomeIcon />,     label: "Home"     },
            { id: "history"  as View, icon: <HistoryIcon />,  label: "History"  },
            { id: "settings" as View, icon: <SettingsIcon />, label: "Settings" },
            { id: "account"  as View, icon: <AccountIcon />,  label: "Account"  },
          ] as const).map(n => {
            const active = view === n.id;
            return (
              <button
                key={n.id}
                className="nav-item"
                title={collapsed ? n.label : undefined}
                onClick={() => setView(n.id)}
                style={{
                  display: "flex", alignItems: "center",
                  gap: 9,
                  padding: collapsed ? "10px 0" : "9px 10px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  color: active ? "var(--text)" : "var(--text-3)",
                  background: active ? "var(--surface-2)" : "transparent",
                  borderRadius: 10,
                  width: "100%",
                  position: "relative",
                  transition: "all 0.15s",
                  fontWeight: 500,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                {active && (
                  <div style={{
                    position: "absolute", left: 0, top: 8, bottom: 8, width: 2,
                    background: "linear-gradient(180deg, #a78bfa, #7dd3fc, #fbbf24, #34d399)",
                    borderRadius: 2,
                  }} />
                )}
                <span style={{ display: "flex", alignItems: "center", flexShrink: 0, color: active ? "var(--c-violet)" : "currentColor" }}>
                  {n.icon}
                </span>
                {!collapsed && n.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{
          borderTop: "1px solid var(--border)",
          paddingTop: 12,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {!collapsed && userName && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 8px",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: "linear-gradient(135deg, #a78bfa, #7dd3fc)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#fff",
              }}>
                {userName.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userName}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: "var(--c-violet)",
                  background: "rgba(167,139,250,0.1)", borderRadius: 4,
                  padding: "1px 5px", display: "inline-block", marginTop: 1,
                }}>
                  {localStorage.getItem("sotto_plan") === "pro" ? "Pro" : "Trial"}
                </div>
              </div>
            </div>
          )}
          <button
            className="collapse-btn"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text-3)",
              cursor: "pointer", padding: "7px 0",
              width: "100%", transition: "background 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <CollapseIcon flipped={collapsed} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {view === "overview" && <OverviewScreen userName={userName} />}
        {view === "history"  && <HistoryScreen />}
        {view === "settings" && <SettingsScreen />}
        {view === "account"  && <AccountScreen userName={userName} />}
      </main>
    </div>
  );
}

/* ── Overview ── */

function OverviewScreen({ userName }: { userName: string }) {
  const m = getMetrics();
  const [recent, setRecent] = useState<Transcription[]>([]);

  useEffect(() => {
    setRecent(getTranscriptions(5));
  }, []);

  const firstName = userName.split(" ")[0] || "there";

  const stats = [
    {
      value: fmtWords(m.totalWords),
      label: "Words",
      sub: "dictated all time",
      accent: "var(--c-violet)",
      accentRgb: "167,139,250",
    },
    {
      value: m.avgWpm || "—",
      label: "WPM",
      sub: "speaking speed",
      accent: "var(--c-blue)",
      accentRgb: "125,211,252",
    },
    {
      value: `${m.streak}`,
      label: "Streak",
      sub: m.streak > 0 ? "days in a row" : "start today",
      accent: "var(--c-amber)",
      accentRgb: "251,191,36",
    },
    {
      value: timeSaved(m.totalWords),
      label: "Time saved",
      sub: "vs typing at 40 wpm",
      accent: "var(--c-mint)",
      accentRgb: "52,211,153",
    },
  ];

  return (
    <div style={{ padding: "32px var(--pad-section) 48px", animation: "fadeIn 0.25s ease" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.14em", color: "var(--text-3)",
          fontFamily: "var(--font-mono)", marginBottom: 8,
        }}>
          Dashboard
        </div>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: 38, lineHeight: 1,
          letterSpacing: "-0.015em",
          fontWeight: 400,
          color: "var(--text)",
        }}>
          {greeting()}, {firstName}.
        </h1>
      </div>

      {/* Stat cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "var(--gap-card)",
        marginBottom: 32,
      }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: "var(--pad-card)",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Accent glow line */}
            <div style={{
              position: "absolute", top: 0, left: 14, right: 14, height: 1,
              background: `linear-gradient(90deg, transparent, ${s.accent}, transparent)`,
            }} />
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: 36, lineHeight: 1,
              letterSpacing: "-0.02em",
              fontWeight: 400,
              color: "var(--text)",
              marginBottom: 6, marginTop: 8,
            }}>
              {s.value}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: s.accent, marginBottom: 3 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Hotkeys */}
      <SectionLabel>Hotkeys</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-card)", marginBottom: 32 }}>
        <HotkeyCard
          keys={["Ctrl", "Shift", "F9"]}
          title="Push to talk"
          sub="Hold while speaking, release to finish"
          icon={<MicIcon />}
        />
        <HotkeyCard
          keys={["Ctrl", "Shift", "F10"]}
          title="Hands-free"
          sub="Toggle auto-detection on / off"
          icon={<WavesIcon />}
        />
      </div>

      {/* Recent */}
      <SectionLabel>Recent</SectionLabel>
      {recent.length === 0 ? (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: "36px 24px",
          textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 4,
          }}>
            <MicIcon dim />
          </div>
          <div style={{ color: "var(--text-3)", fontSize: 14, fontWeight: 600 }}>No transcriptions yet</div>
          <div style={{ color: "var(--text-4)", fontSize: 12, lineHeight: 1.6, maxWidth: 280 }}>
            Focus any text field, then hold{" "}
            <kbd style={{
              background: "var(--surface-2)", border: "1px solid var(--border-strong)",
              borderRadius: 5, padding: "1px 6px", fontSize: 11, fontFamily: "var(--font-mono)",
              color: "var(--text-3)",
            }}>Ctrl+Shift+F9</kbd>{" "}
            and speak.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recent.map(item => (
            <div key={item.id} style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
            }}>
              <div style={{ color: "var(--text)", fontSize: 14, marginBottom: 6, lineHeight: 1.5 }}>
                {item.text.length > 120 ? item.text.slice(0, 120) + "…" : item.text}
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                {new Date(item.created_at).toLocaleString()}
                {item.duration_ms > 0 && <> · {(item.duration_ms / 1000).toFixed(1)}s</>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.14em", color: "var(--text-3)",
      fontFamily: "var(--font-mono)", marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function HotkeyCard({ keys, title, sub, icon }: {
  keys: string[]; title: string; sub: string; icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-card)",
      padding: "var(--pad-card)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {keys.map((k, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <kbd style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                borderBottom: "2px solid rgba(255,255,255,0.06)",
                borderRadius: 6, padding: "3px 7px",
                fontSize: 10, fontWeight: 600,
                color: "var(--text-3)",
                fontFamily: "var(--font-mono)",
              }}>{k}</kbd>
              {i < keys.length - 1 && <span style={{ color: "var(--text-4)", fontSize: 10 }}>+</span>}
            </span>
          ))}
        </div>
      </div>
      <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ color: "var(--text-3)", fontSize: 11, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

/* ── History ── */

function HistoryScreen() {
  const [items, setItems]       = useState<Transcription[]>([]);
  const [query, setQuery]       = useState("");
  const [selected, setSelected] = useState<Transcription | null>(null);
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    const all = getTranscriptions(200);
    setItems(all);
    if (all.length > 0) setSelected(all[0]);
  }, []);

  const filtered = query.trim()
    ? items.filter(i => i.text.toLowerCase().includes(query.toLowerCase()))
    : items;

  const copy = () => {
    if (!selected) return;
    navigator.clipboard.writeText(selected.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  if (items.length === 0) {
    return (
      <div style={{ padding: "32px var(--pad-section)", animation: "fadeIn 0.25s ease" }}>
        <EyebrowLabel>History</EyebrowLabel>
        <PageTitle>Your transcriptions</PageTitle>
        <div style={{
          marginTop: 32,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)", padding: "48px 24px",
          textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <div style={{ color: "var(--text-3)", fontSize: 15, fontWeight: 600 }}>No history yet</div>
          <div style={{ color: "var(--text-4)", fontSize: 13 }}>Your transcriptions will appear here after your first session.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", animation: "fadeIn 0.25s ease" }}>
      {/* Left panel */}
      <div style={{
        width: 380, minWidth: 380,
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{ padding: "20px 16px 12px" }}>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)" }}>
              <SearchIcon />
            </div>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search transcriptions…"
              style={{
                width: "100%",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 12px 8px 32px",
                fontSize: 13,
                color: "var(--text)",
              }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              No results
            </div>
          ) : filtered.map(item => (
            <button
              key={item.id}
              className="history-row"
              onClick={() => setSelected(item)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                background: selected?.id === item.id ? "var(--surface-2)" : "transparent",
                border: "1px solid " + (selected?.id === item.id ? "var(--border-strong)" : "transparent"),
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px", marginBottom: 2,
                transition: "all 0.12s",
              }}
            >
              <div style={{
                fontSize: 13, color: "var(--text)", lineHeight: 1.4, marginBottom: 4,
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
                {item.text.slice(0, 80)}{item.text.length > 80 ? "…" : ""}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                {new Date(item.created_at).toLocaleString()}
                {item.duration_ms > 0 && <> · {(item.duration_ms / 1000).toFixed(1)}s</>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>
        {selected ? (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>
                  {new Date(selected.created_at).toLocaleString()}
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-4)" }}>
                  {selected.duration_ms > 0 && <span>{(selected.duration_ms / 1000).toFixed(1)}s</span>}
                  <span>{selected.text.trim().split(/\s+/).length} words</span>
                  {selected.model && <span style={{ color: "rgba(167,139,250,0.6)", fontFamily: "var(--font-mono)" }}>{selected.model}</span>}
                </div>
              </div>
              <button
                className="copy-btn"
                onClick={copy}
                style={{
                  background: copied ? "rgba(52,211,153,0.12)" : "var(--surface-2)",
                  border: "1px solid " + (copied ? "rgba(52,211,153,0.3)" : "var(--border)"),
                  borderRadius: "var(--radius-sm)",
                  padding: "7px 14px",
                  fontSize: 12, fontWeight: 500,
                  color: copied ? "var(--c-mint)" : "var(--text-2)",
                  transition: "all 0.15s",
                  flexShrink: 0,
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
              padding: "var(--pad-card)",
              fontSize: 15, color: "var(--text)", lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}>
              {selected.text}
            </div>
          </>
        ) : (
          <div style={{ color: "var(--text-4)", fontSize: 14, paddingTop: 40, textAlign: "center" }}>
            Select a transcription to view
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Settings ── */

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "audio",   label: "Audio & Mic" },
  { id: "hotkeys", label: "Hotkeys" },
  { id: "ai",      label: "AI & Format" },
  { id: "privacy", label: "Privacy" },
];

function SettingsScreen() {
  const [tab, setTab] = useState<SettingsTab>("general");

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", animation: "fadeIn 0.25s ease" }}>
      {/* Tab nav */}
      <div style={{
        width: 180, minWidth: 180,
        borderRight: "1px solid var(--border)",
        padding: "24px 10px",
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        <div style={{ padding: "0 8px", marginBottom: 16 }}>
          <EyebrowLabel>Settings</EyebrowLabel>
        </div>
        {SETTINGS_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 13, fontWeight: 500,
              color: tab === t.id ? "var(--text)" : "var(--text-3)",
              background: tab === t.id ? "var(--surface-2)" : "transparent",
              border: "1px solid " + (tab === t.id ? "var(--border)" : "transparent"),
              transition: "all 0.12s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
        {tab === "general" && <GeneralTab />}
        {tab === "audio"   && <AudioPanel />}
        {tab === "hotkeys" && <HotkeysTab />}
        {tab === "ai"      && <ModelsTab />}
        {tab === "privacy" && <PrivacyPanel />}
      </div>
    </div>
  );
}

function AudioPanel() {
  return (
    <div>
      <PageTitle>Audio & Mic</PageTitle>
      <div style={{ marginTop: 24 }}>
        <CloudTab />
      </div>
    </div>
  );
}

function PrivacyPanel() {
  return (
    <div>
      <PageTitle>Privacy</PageTitle>
      <div style={{ marginTop: 24 }}>
        <LicenseTab />
      </div>
    </div>
  );
}

/* ── Account ── */

function AccountScreen({ userName }: { userName: string }) {
  const { tier, model } = useAppStore();
  const plan = localStorage.getItem("sotto_plan") ?? "trial";

  return (
    <div style={{ padding: "32px var(--pad-section) 48px", animation: "fadeIn 0.25s ease" }}>
      <EyebrowLabel>Account</EyebrowLabel>
      <PageTitle>Your plan</PageTitle>

      <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* User card */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)", padding: "var(--pad-card)",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: "linear-gradient(135deg, #a78bfa, #7dd3fc)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 700, color: "#fff",
          }}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{userName}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>
              {plan === "pro" ? "Pro plan · active" : "Free trial"}
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: plan === "pro" ? "var(--c-violet)" : "var(--c-amber)",
              background: plan === "pro" ? "rgba(167,139,250,0.1)" : "rgba(251,191,36,0.1)",
              border: "1px solid " + (plan === "pro" ? "rgba(167,139,250,0.2)" : "rgba(251,191,36,0.2)"),
              borderRadius: 99, padding: "4px 12px",
            }}>
              {plan === "pro" ? "Pro" : "Trial"}
            </span>
          </div>
        </div>

        {/* Model info */}
        {model && (
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)", padding: "var(--pad-card)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
              Active model
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{model}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{tier ?? ""} · {tier === "tier4" ? "cloud" : "local inference"}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shared helpers ── */

function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.14em", color: "var(--text-3)",
      fontFamily: "var(--font-mono)", marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 style={{
      fontFamily: "var(--font-display)",
      fontSize: 38, lineHeight: 1,
      letterSpacing: "-0.015em",
      fontWeight: 400,
      color: "var(--text)",
    }}>
      {children}
    </h1>
  );
}

/* ── Icons ── */

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function MicIcon({ dim = false }: { dim?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke={dim ? "var(--text-4)" : "rgba(167,139,250,0.8)"}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  );
}

function WavesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(125,211,252,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h2a2 2 0 0 0 2-2V8a2 2 0 0 1 2-2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0 2-2V8a2 2 0 0 1 2-2 2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h2"/>
    </svg>
  );
}

function CollapseIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: flipped ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

import React from "react";
