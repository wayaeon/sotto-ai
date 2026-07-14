import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import { getTranscriptions, type Transcription } from "../lib/db";
import Orb from "./Orb";
import PipelineDebug from "./PipelineDebug";

// ─── Types ────────────────────────────────────────────────

type View = "home" | "history" | "insights" | "commands" | "settings" | "account" | "debug";

interface Metrics {
  totalWords: number;
  sessions: number;
  streak: number;
  avgWpm: number;
  totalMs: number;
}

interface Command {
  id: string;
  trigger: string;
  action: "REPLACE" | "TEMPLATE" | "REWRITE";
  actionLabel: string;
  body: string;
  scope: "all" | "slack" | "email" | "code" | "doc";
  enabled: boolean;
  runs: number;
  accent: string;
}

interface DictEntry {
  id: string;
  term: string;
  phonetic: string;
}

// ─── Constants ────────────────────────────────────────────

const DEFAULT_COMMANDS: Command[] = [
  {
    id: "cmd_1",
    trigger: "sign off",
    action: "REPLACE",
    actionLabel: "Replace",
    body: "Thanks,\nWa-Ya",
    scope: "email",
    enabled: true,
    runs: 12,
    accent: "violet",
  },
  {
    id: "cmd_2",
    trigger: "ship it",
    action: "REPLACE",
    actionLabel: "Replace",
    body: "🚢 LGTM — shipping.",
    scope: "slack",
    enabled: true,
    runs: 8,
    accent: "blue",
  },
  {
    id: "cmd_3",
    trigger: "todo block",
    action: "TEMPLATE",
    actionLabel: "Template",
    body: "## TODO\n- [ ] \n- [ ] \n- [ ] ",
    scope: "doc",
    enabled: false,
    runs: 3,
    accent: "amber",
  },
];

// ─── Helpers ──────────────────────────────────────────────

function getMetrics(): Metrics {
  return {
    totalWords: parseInt(localStorage.getItem("verba_total_words") ?? "0"),
    sessions:   parseInt(localStorage.getItem("verba_sessions") ?? "0"),
    streak:     parseInt(localStorage.getItem("verba_streak") ?? "0"),
    avgWpm:     parseInt(localStorage.getItem("verba_avg_wpm") ?? "0"),
    totalMs:    parseInt(localStorage.getItem("verba_total_ms") ?? "0"),
  };
}

function getSetting(key: string, def: string): string {
  return localStorage.getItem(`verba_setting_${key}`) ?? def;
}
function setSetting(key: string, val: string): void {
  localStorage.setItem(`verba_setting_${key}`, val);
}

function fmtDuration(ms: number): string {
  if (!ms) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function fmtMinutes(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getGreeting(name: string): string {
  const h = new Date().getHours();
  const first = name.split(" ")[0] || "there";
  if (h < 12) return `Good morning, ${first}`;
  if (h < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

function getDayOfWeek(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long" });
}

function getCommands(): Command[] {
  try {
    const raw = localStorage.getItem("verba_commands");
    if (raw) return JSON.parse(raw) as Command[];
  } catch { /* ignore */ }
  localStorage.setItem("verba_commands", JSON.stringify(DEFAULT_COMMANDS));
  return DEFAULT_COMMANDS;
}

function saveCommands(cmds: Command[]): void {
  localStorage.setItem("verba_commands", JSON.stringify(cmds));
}

function getDictionary(): DictEntry[] {
  try {
    const raw = localStorage.getItem("verba_dictionary");
    if (raw) return JSON.parse(raw) as DictEntry[];
  } catch { /* ignore */ }
  return [];
}

function saveDictionary(entries: DictEntry[]): void {
  localStorage.setItem("verba_dictionary", JSON.stringify(entries));
}

const DEFAULT_FILLER_WORDS = [
  "um", "umm", "uh", "uhh", "like", "you know", "i mean",
  "sort of", "kind of", "actually", "basically", "literally", "so yeah",
];

function getFillerWords(): string[] {
  try {
    const raw = localStorage.getItem("verba_filler_words");
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return DEFAULT_FILLER_WORDS;
}

function saveFillerWords(words: string[]): void {
  localStorage.setItem("verba_filler_words", JSON.stringify(words));
}

// ─── SVG Icons ────────────────────────────────────────────

interface SvgProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

function IcoSvg({ size = 16, className, style, children }: SvgProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style}
    >
      {children}
    </svg>
  );
}

// 5-bar waveform logo (88.8 × 120 native, bars tall → short → tall)
function WaveMark({ size = 20 }: { size?: number }) {
  const w = size * (88.8 / 120);
  const id = "wm-g";
  return (
    <svg width={w} height={size} viewBox="0 0 88.8 120" fill="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#a78bfa" />
          <stop offset="33%"  stopColor="#7dd3fc" />
          <stop offset="66%"  stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <rect x="0"    y="40.8" width="12" height="38.4"  rx="6" fill={`url(#${id})`} />
      <rect x="19.2" y="22.8" width="12" height="74.4"  rx="6" fill={`url(#${id})`} />
      <rect x="38.4" y="0"    width="12" height="120"   rx="6" fill={`url(#${id})`} />
      <rect x="57.6" y="33"   width="12" height="54"    rx="6" fill={`url(#${id})`} />
      <rect x="76.8" y="13.2" width="12" height="93.6"  rx="6" fill={`url(#${id})`} />
    </svg>
  );
}

const Icons = {
  Home: (p: SvgProps) => <IcoSvg {...p}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></IcoSvg>,
  Clock: (p: SvgProps) => <IcoSvg {...p}><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></IcoSvg>,
  BarChart: (p: SvgProps) => <IcoSvg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></IcoSvg>,
  Bolt: (p: SvgProps) => <IcoSvg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></IcoSvg>,
  Settings: (p: SvgProps) => <IcoSvg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></IcoSvg>,
  User: (p: SvgProps) => <IcoSvg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></IcoSvg>,
  Mic: (p: SvgProps) => <IcoSvg {...p}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></IcoSvg>,
  Waves: (p: SvgProps) => <IcoSvg {...p}><path d="M2 12c0-3 3-3 3-6s-3-3-3-6"/><path d="M7 12c0-3 3-3 3-6s-3-3-3-6"/><path d="M12 12c0-3 3-3 3-6s-3-3-3-6"/><path d="M17 12c0-3 3-3 3-6s-3-3-3-6"/></IcoSvg>,
  Sparkles: (p: SvgProps) => <IcoSvg {...p}><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></IcoSvg>,
  ChevronRight: (p: SvgProps) => <IcoSvg {...p}><polyline points="9 18 15 12 9 6"/></IcoSvg>,
  ChevronLeft: (p: SvgProps) => <IcoSvg {...p}><polyline points="15 18 9 12 15 6"/></IcoSvg>,
  ArrowRight: (p: SvgProps) => <IcoSvg {...p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></IcoSvg>,
  ArrowUpRight: (p: SvgProps) => <IcoSvg {...p}><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></IcoSvg>,
  Copy: (p: SvgProps) => <IcoSvg {...p}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></IcoSvg>,
  Trash: (p: SvgProps) => <IcoSvg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></IcoSvg>,
  Edit: (p: SvgProps) => <IcoSvg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></IcoSvg>,
  Mail: (p: SvgProps) => <IcoSvg {...p}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></IcoSvg>,
  Hash: (p: SvgProps) => <IcoSvg {...p}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></IcoSvg>,
  Code: (p: SvgProps) => <IcoSvg {...p}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></IcoSvg>,
  FileText: (p: SvgProps) => <IcoSvg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></IcoSvg>,
  Globe: (p: SvgProps) => <IcoSvg {...p}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></IcoSvg>,
  Search: (p: SvgProps) => <IcoSvg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></IcoSvg>,
  Plus: (p: SvgProps) => <IcoSvg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></IcoSvg>,
  X: (p: SvgProps) => <IcoSvg {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></IcoSvg>,
  Check: (p: SvgProps) => <IcoSvg {...p}><polyline points="20 6 9 17 4 12"/></IcoSvg>,
  Play: (p: SvgProps) => <IcoSvg {...p}><polygon points="5 3 19 12 5 21 5 3"/></IcoSvg>,
  Download: (p: SvgProps) => <IcoSvg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></IcoSvg>,
  Volume: (p: SvgProps) => <IcoSvg {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></IcoSvg>,
  Shield: (p: SvgProps) => <IcoSvg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></IcoSvg>,
  Filter: (p: SvgProps) => <IcoSvg {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></IcoSvg>,
  ListTree: (p: SvgProps) => <IcoSvg {...p}><path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/></IcoSvg>,
  CreditCard: (p: SvgProps) => <IcoSvg {...p}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></IcoSvg>,
  Languages: (p: SvgProps) => <IcoSvg {...p}><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></IcoSvg>,
};

// ─── Shared Components ────────────────────────────────────

interface WaveformProps {
  bars?: number;
  height?: number;
  color?: string;
  style?: React.CSSProperties;
  static?: boolean;
}

function Waveform({ bars = 20, height = 28, color = "currentColor", style, static: isStatic = false }: WaveformProps) {
  const heights = useMemo(() => {
    return Array.from({ length: bars }, (_, i) => {
      const h = Math.abs(Math.sin(i * 0.7 + 1.2)) * 0.65 + 0.35;
      return Math.round(h * height);
    });
  }, [bars, height]);

  return (
    <div
      className={`wave${isStatic ? " wave-static" : ""}`}
      style={{ height, color, ...style }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className="bar"
          style={{
            height: h,
            animationDelay: isStatic ? undefined : `${(i * 60) % 1200}ms`,
          }}
        />
      ))}
    </div>
  );
}

interface KbdProps {
  keys: string[];
}

function Kbd({ keys }: KbdProps) {
  return (
    <div className="kbd-row">
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="kbd-plus">+</span>}
          <span className="kbd">{k}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

interface ChipProps {
  tone?: string;
  dot?: boolean;
  children: React.ReactNode;
}

function Chip({ tone, dot, children }: ChipProps) {
  return (
    <span className="chip" data-tone={tone}>
      {dot && <span className="chip-dot" />}
      {children}
    </span>
  );
}

interface StatProps {
  value: string | number;
  unit?: string;
  label: string;
  sub?: string;
  delta?: string;
  deltaDown?: boolean;
  accent: string;
  italic?: boolean;
  hint?: string;
}

function Stat({ value, unit, label, sub, delta, deltaDown, accent, italic, hint }: StatProps) {
  return (
    <div className="stat" data-accent={accent}>
      {delta && <span className={`stat-delta${deltaDown ? " down" : ""}`}>{delta}</span>}
      <div className="stat-value">
        {italic ? <em>{value}</em> : value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">
        <span className="l" title={hint}>{label}</span>
        {sub && <span className="sub">{sub}</span>}
      </div>
    </div>
  );
}

interface ToggleProps {
  on: boolean;
  onChange: (v: boolean) => void;
}

function Toggle({ on, onChange }: ToggleProps) {
  return (
    <div
      className="toggle"
      data-on={String(on)}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
    />
  );
}

interface SectionHeadProps {
  label: string;
  action?: React.ReactNode;
}

function SectionHead({ label, action }: SectionHeadProps) {
  return (
    <div className="section-head">
      <span className="section-title">{label}</span>
      {action}
    </div>
  );
}

// ─── Home Screen ──────────────────────────────────────────

interface HomeScreenProps {
  transcriptions: Transcription[];
  metrics: Metrics;
  userName: string;
  onViewChange: (v: View) => void;
}

function HomeScreen({ transcriptions, metrics, userName, onViewChange }: HomeScreenProps) {
  const firstName = userName.split(" ")[0] || "there";
  const greeting = getGreeting(userName);
  const lastSegment = useAppStore((s) => s.lastSegment);
  const model = useAppStore((s) => s.model);
  const modelReady = useAppStore((s) => s.modelReady);
  const lastDictationApp = useAppStore((s) => s.lastDictationApp);
  const lastDictationStats = useAppStore((s) => s.lastDictationStats);

  // Today's words from actual transcription timestamps (not lifetime aggregates)
  const todayWords = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return transcriptions
      .filter((t) => new Date(t.created_at).getTime() >= start.getTime())
      .reduce((sum, t) => sum + t.text.trim().split(/\s+/).filter(Boolean).length, 0);
  }, [transcriptions]);

  const lastText = lastSegment || transcriptions[0]?.text || "";
  const modelLabel = model ? (model.split("/").pop() ?? model) : null;

  const ambient: string[] = [];
  if (todayWords > 0) ambient.push(`today: ${todayWords.toLocaleString()} words`);
  if (metrics.avgWpm > 0) ambient.push(`${metrics.avgWpm} wpm`);
  if (metrics.streak > 0) ambient.push(`streak ${metrics.streak}d`);

  return (
    <div className="main fade-in">
      <div className="main-header talk-header">
        <div>
          <div className="eyebrow">
            {getDayOfWeek()}, {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            {modelLabel && (
              <span className="talk-model-chip" data-ready={String(modelReady)}>
                {modelLabel}
              </span>
            )}
          </div>
          <h1 className="page-title talk-greeting">
            {greeting.replace(`, ${firstName}`, ", ")}<em>{firstName}</em>
          </h1>
        </div>
      </div>

      {/* The Talk surface: one hero, everything else ambient (DESIGN.md §3) */}
      <div className="talk-body">
        <Orb />

        {lastText ? (
          <button className="talk-last" onClick={() => onViewChange("history")} title="Open history">
            <span className="talk-last-rule" />
            <em>“{lastText.length > 120 ? lastText.slice(0, 120) + "…" : lastText}”</em>
            <span className="talk-last-rule" />
          </button>
        ) : (
          <div className="talk-last talk-last-empty">
            Hold <kbd>Ctrl</kbd> + <kbd>Win</kbd> and speak — your words appear wherever you're typing.
          </div>
        )}

        {/* Per-utterance summary: what you just dictated into, and how much. */}
        {lastDictationStats && (
          <div className="talk-summary">
            {lastDictationApp?.iconDataUri && (
              <img src={lastDictationApp.iconDataUri} alt="" className="talk-summary-icon" />
            )}
            {lastDictationApp && <span>{lastDictationApp.name}</span>}
            {lastDictationApp && <span>·</span>}
            <span>{lastDictationStats.wordCount} word{lastDictationStats.wordCount === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>{fmtDuration(lastDictationStats.durationMs)}</span>
          </div>
        )}

        {ambient.length > 0 && (
          <button className="talk-ambient" onClick={() => onViewChange("history")} title="Open insights">
            {ambient.join(" · ")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── History Screen ───────────────────────────────────────

/** v2: History hosts two tabs — Transcripts (default) and Insights (DESIGN.md §4). */
function HistoryView({ transcriptions, metrics }: { transcriptions: Transcription[]; metrics: Metrics }) {
  const [tab, setTab] = useState<"transcripts" | "insights">("transcripts");
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      <div className="view-tabs">
        <button className={tab === "transcripts" ? "active" : ""} onClick={() => setTab("transcripts")}>
          Transcripts
        </button>
        <button className={tab === "insights" ? "active" : ""} onClick={() => setTab("insights")}>
          Insights
        </button>
      </div>
      {tab === "transcripts"
        ? <HistoryScreen transcriptions={transcriptions} />
        : <InsightsScreen transcriptions={transcriptions} metrics={metrics} />}
    </div>
  );
}

interface HistoryScreenProps {
  transcriptions: Transcription[];
}

function HistoryScreen({ transcriptions }: HistoryScreenProps) {
  const [selected, setSelected] = useState<Transcription | null>(transcriptions[0] ?? null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    return transcriptions.filter((t) => {
      if (search && !t.text.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter !== "all" && t.app_name !== filter) return false;
      return true;
    });
  }, [transcriptions, search, filter]);

  function handleCopy() {
    if (!selected) return;
    navigator.clipboard.writeText(selected.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDownload() {
    if (!selected) return;
    const blob = new Blob([selected.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcription-${selected.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const contextFilters = useMemo(() => {
    const names = new Set(
      transcriptions.map((t) => t.app_name).filter((n): n is string => !!n)
    );
    return ["all", ...[...names].sort()];
  }, [transcriptions]);

  useEffect(() => {
    if (filter !== "all" && !contextFilters.includes(filter)) {
      setFilter("all");
    }
  }, [filter, contextFilters]);

  return (
    <div className="main" style={{ overflow: "hidden" }}>
      <div className="main-header">
        <div>
          <div className="eyebrow">Library · {transcriptions.length} transcription{transcriptions.length !== 1 ? "s" : ""}</div>
          <h1 className="page-title"><em>History</em></h1>
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ padding: "12px 36px", display: "flex", gap: 10, alignItems: "center" }}>
        <div className="input" style={{ flex: 1 }}>
          <Icons.Search size={14} style={{ color: "var(--text-4)", flexShrink: 0 }} />
          <input
            placeholder="Search transcriptions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {contextFilters.map((f) => (
            <button
              key={f}
              className={`btn btn-sm${filter === f ? "" : " btn-ghost"}`}
              style={filter === f ? { background: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.25)", color: "var(--c-violet)" } : {}}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      </div>

      {/* Split pane */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", borderTop: "1px solid var(--border)" }}>
        {/* List */}
        <div style={{ width: 380, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div className="empty" style={{ margin: 24 }}>
              <div className="empty-icon"><Icons.Clock size={22} /></div>
              <h4>No transcriptions</h4>
              <p>Start dictating to build your library.</p>
            </div>
          ) : (
            filtered.map((t) => {
              const title = t.text.slice(0, 60) || "Untitled";
              const preview = t.text.slice(0, 80);
              const when = relativeTime(t.created_at);
              const dur = fmtDuration(t.duration_ms);
              const isSelected = selected?.id === t.id;
              return (
                <div
                  key={t.id}
                  className={`list-row${isSelected ? " selected" : ""}`}
                  style={{ gridTemplateColumns: "1fr" }}
                  onClick={() => setSelected(t)}
                  title={t.text}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(125,211,252,0.08)", border: "1px solid rgba(125,211,252,0.14)", display: "grid", placeItems: "center", color: "var(--c-blue)", flexShrink: 0, overflow: "hidden" }}>
                      {t.app_icon ? <img src={t.app_icon} alt="" style={{ width: 16, height: 16 }} /> : <Icons.FileText size={13} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
                    <span>{dur}</span>
                    <span>{when}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Detail */}
        <div style={{ flex: 1, overflowY: "auto", padding: 28 }}>
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <div style={{ textAlign: "center", color: "var(--text-4)" }}>
                <Icons.FileText size={36} />
                <p style={{ marginTop: 12, fontSize: 13 }}>Select a transcription</p>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 400, margin: "0 0 8px" }}>
                  {selected.text.slice(0, 60) || "Untitled"}
                </h2>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                  <span>{new Date(selected.created_at).toLocaleString()}</span>
                  <span>·</span>
                  <span>{fmtDuration(selected.duration_ms)}</span>
                  <span>·</span>
                  <span>{wordCount(selected.text)} words</span>
                  {selected.model && <><span>·</span><span>{selected.model}</span></>}
                </div>
              </div>

              {/* Waveform strip — decorative duration indicator, no audio is retained to play back */}
              <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "14px 18px" }}>
                <Waveform bars={40} height={24} color="var(--c-violet)" static />
                <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                  {fmtDuration(selected.duration_ms)}
                </span>
              </div>

              {/* Text */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>Transcript</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={handleCopy}>
                      {copied ? <Icons.Check size={12} /> : <Icons.Copy size={12} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={handleDownload}>
                      <Icons.Download size={12} /> Download
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-2)", margin: 0, whiteSpace: "pre-wrap" }}>
                  {selected.text}
                </p>
              </div>

              {/* Meta */}
              <div className="card" style={{ fontSize: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-4)", fontFamily: "var(--font-mono)", marginBottom: 12 }}>Details</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", color: "var(--text-3)" }}>
                  <div>Model: <span style={{ color: "var(--text-2)" }}>{selected.model || "—"}</span></div>
                  <div>Tier: <span style={{ color: "var(--text-2)" }}>{selected.tier || "—"}</span></div>
                  <div>Words: <span style={{ color: "var(--text-2)" }}>{wordCount(selected.text)}</span></div>
                  <div>Duration: <span style={{ color: "var(--text-2)" }}>{fmtDuration(selected.duration_ms)}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Activity Heatmap ────────────────────────────────────

type HeatmapMode = "24h" | "30d" | "365d";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function heatCell(t: number, hue: number): string {
  if (t <= 0) return "rgba(255,255,255,0.03)";
  const L = 40 + t * 38;
  const C = 0.08 + t * 0.20;
  return `oklch(${L.toFixed(1)}% ${C.toFixed(3)} ${hue.toFixed(0)})`;
}

function ActivityHeatmap({ transcriptions }: { transcriptions: Transcription[] }) {
  const [mode, setMode] = useState<HeatmapMode>("24h");

  // ── 24h: day-of-week × hour ──────────────────────────────
  const grid24h = useMemo(() => {
    // [0=Mon..6=Sun][0..23]
    const g: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    transcriptions.forEach((t) => {
      const d = new Date(t.created_at);
      const dow = (d.getDay() + 6) % 7; // convert Sun=0 → Mon=0
      const hr = d.getHours();
      g[dow][hr]++;
    });
    return g;
  }, [transcriptions]);

  const max24h = Math.max(...grid24h.flat(), 1);

  // ── 30d: last 30 calendar days ───────────────────────────
  const cells30d = useMemo(() => {
    const now = new Date();
    const result: { date: Date; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      result.push({ date: d, count: 0 });
    }
    transcriptions.forEach((t) => {
      const d = new Date(t.created_at);
      d.setHours(0, 0, 0, 0);
      const idx = result.findIndex((r) => r.date.getTime() === d.getTime());
      if (idx >= 0) result[idx].count++;
    });
    return result;
  }, [transcriptions]);
  const max30d = Math.max(...cells30d.map((c) => c.count), 1);

  // Grid: 5 rows × 7 cols (calendar weeks). Pad to start on Monday.
  const startDow30d = (cells30d[0].date.getDay() + 6) % 7; // Mon=0
  const padded30d = [...Array(startDow30d).fill(null), ...cells30d];

  // ── 365d: GitHub-style 52 weeks ──────────────────────────
  const cells365d = useMemo(() => {
    const now = new Date();
    const result: { date: Date; count: number }[] = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      result.push({ date: d, count: 0 });
    }
    transcriptions.forEach((t) => {
      const d = new Date(t.created_at);
      d.setHours(0, 0, 0, 0);
      const idx = result.findIndex((r) => r.date.getTime() === d.getTime());
      if (idx >= 0) result[idx].count++;
    });
    return result;
  }, [transcriptions]);
  const max365d = Math.max(...cells365d.map((c) => c.count), 1);

  // Pad to week boundary (Mon), then chunk into weeks (columns)
  const startDow365d = (cells365d[0].date.getDay() + 6) % 7;
  const padded365d = [...Array(startDow365d).fill(null), ...cells365d];
  // chunk into weeks of 7
  const weeks365d: (typeof cells365d[0] | null)[][] = [];
  for (let i = 0; i < padded365d.length; i += 7) {
    weeks365d.push(padded365d.slice(i, i + 7));
  }
  // month labels: find first day of each month in weeks
  const monthLabels365d: { weekIdx: number; label: string }[] = [];
  weeks365d.forEach((week, wi) => {
    const first = week.find((c) => c !== null);
    if (first && first.date.getDate() <= 7) {
      const prev = wi > 0 ? weeks365d[wi - 1].find((c) => c !== null) : null;
      if (!prev || prev.date.getMonth() !== first.date.getMonth()) {
        monthLabels365d.push({ weekIdx: wi, label: MONTH_NAMES[first.date.getMonth()] });
      }
    }
  });

  const CELL_365 = 13; // px per cell including gap
  const CELL_GAP = 3;
  const CELL_SZ  = CELL_365 - CELL_GAP;

  const modeLabel = mode === "24h" ? "Mon–Sun · 24h" : mode === "30d" ? "Last 30 days" : "Last 365 days";

  return (
    <>
      <SectionHead
        label="When You Dictate"
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="chip"><span className="chip-dot" style={{ background: "var(--c-violet)" }} />{modeLabel}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["24h", "30d", "365d"] as HeatmapMode[]).map((m) => (
                <button
                  key={m}
                  className={`btn btn-sm${mode === m ? "" : " btn-ghost"}`}
                  style={mode === m ? { background: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.25)", color: "var(--c-violet)" } : {}}
                  onClick={() => setMode(m)}
                >{m}</button>
              ))}
            </div>
          </div>
        }
      />
      <div className="card" style={{ overflowX: "auto" }}>
        {transcriptions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-4)", fontSize: 13 }}>
            No data yet — start dictating to see when you're most productive.
          </div>
        ) : mode === "24h" ? (
          /* ── 24h view ── */
          <div>
            {/* hour labels */}
            <div style={{ display: "flex", paddingLeft: 38, marginBottom: 6 }}>
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} style={{ flex: 1, fontSize: 9, color: "var(--text-4)", fontFamily: "var(--font-mono)", textAlign: "center" }}>
                  {i % 4 === 0 ? String(i).padStart(2, "0") : ""}
                </div>
              ))}
            </div>
            {grid24h.map((hours, dayIdx) => (
              <div key={dayIdx} style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
                <span style={{ width: 32, fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)", textAlign: "right", paddingRight: 6, flexShrink: 0 }}>
                  {DAY_LABELS[dayIdx]}
                </span>
                {hours.map((count, hourIdx) => {
                  const t = count / max24h;
                  const hue = 290 + (hourIdx / 23) * 70; // violet → pink across the day
                  return (
                    <div
                      key={hourIdx}
                      title={`${DAY_LABELS[dayIdx]} ${String(hourIdx).padStart(2,"0")}:00 — ${count} session${count !== 1 ? "s" : ""}`}
                      style={{ flex: 1, height: 28, borderRadius: 4, background: heatCell(t, hue), border: "1px solid rgba(255,255,255,0.02)", transition: "background 0.15s" }}
                    />
                  );
                })}
              </div>
            ))}
            {/* legend */}
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 12, fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              <span>less</span>
              <div style={{ display: "flex", gap: 3 }}>
                {[0.1, 0.3, 0.55, 0.75, 0.95].map((v, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: heatCell(v, 290 + i * 17) }} />
                ))}
              </div>
              <span>more</span>
            </div>
          </div>
        ) : mode === "30d" ? (
          /* ── 30d calendar view ── */
          <div>
            {/* day-of-week header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
              {DAY_LABELS.map((d) => (
                <div key={d} style={{ fontSize: 9, color: "var(--text-4)", fontFamily: "var(--font-mono)", textAlign: "center" }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {padded30d.map((cell, i) => {
                if (!cell) return <div key={i} />;
                const t = cell.count / max30d;
                const isToday = cell.date.toDateString() === new Date().toDateString();
                return (
                  <div
                    key={i}
                    title={`${cell.date.toLocaleDateString()} — ${cell.count} session${cell.count !== 1 ? "s" : ""}`}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 6,
                      background: heatCell(t, 290),
                      border: isToday ? "1px solid var(--c-violet)" : "1px solid rgba(255,255,255,0.02)",
                      display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
                      padding: 3, fontSize: 9, color: t > 0.4 ? "rgba(255,255,255,0.7)" : "var(--text-4)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {cell.date.getDate()}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 12, fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              <span>less</span>
              <div style={{ display: "flex", gap: 3 }}>
                {[0.1, 0.3, 0.55, 0.75, 0.95].map((v, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: heatCell(v, 290) }} />
                ))}
              </div>
              <span>more</span>
            </div>
          </div>
        ) : (
          /* ── 365d GitHub-style ── */
          <div>
            {/* month labels row */}
            <div style={{ display: "flex", marginBottom: 4, paddingLeft: 28 }}>
              {weeks365d.map((_, wi) => {
                const label = monthLabels365d.find((m) => m.weekIdx === wi);
                return (
                  <div key={wi} style={{ width: CELL_365, flexShrink: 0, fontSize: 9, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
                    {label ? label.label : ""}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 0 }}>
              {/* day labels column */}
              <div style={{ display: "flex", flexDirection: "column", gap: CELL_GAP, marginRight: 4, width: 24 }}>
                {DAY_LABELS.map((d, i) => (
                  <div key={d} style={{ height: CELL_SZ, fontSize: 9, color: i % 2 === 0 ? "var(--text-4)" : "transparent", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 2 }}>
                    {d.slice(0, 2)}
                  </div>
                ))}
              </div>
              {/* week columns */}
              <div style={{ display: "flex", gap: CELL_GAP, overflowX: "auto" }}>
                {weeks365d.map((week, wi) => (
                  <div key={wi} style={{ display: "flex", flexDirection: "column", gap: CELL_GAP }}>
                    {Array.from({ length: 7 }, (_, di) => {
                      const cell = week[di] ?? null;
                      if (!cell) return <div key={di} style={{ width: CELL_SZ, height: CELL_SZ }} />;
                      const t = cell.count / max365d;
                      const isToday = cell.date.toDateString() === new Date().toDateString();
                      return (
                        <div
                          key={di}
                          title={`${cell.date.toLocaleDateString()} — ${cell.count} session${cell.count !== 1 ? "s" : ""}`}
                          style={{
                            width: CELL_SZ, height: CELL_SZ, borderRadius: 2,
                            background: heatCell(t, 290),
                            border: isToday ? "1px solid var(--c-violet)" : "1px solid rgba(255,255,255,0.02)",
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 12, fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              <span>less</span>
              <div style={{ display: "flex", gap: 3 }}>
                {[0.1, 0.3, 0.55, 0.75, 0.95].map((v, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: heatCell(v, 290) }} />
                ))}
              </div>
              <span>more</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Insights Screen ──────────────────────────────────────

interface InsightsScreenProps {
  transcriptions: Transcription[];
  metrics: Metrics;
}

const INSIGHTS_STOP_WORDS = new Set([
  "the", "a", "an", "is", "it", "to", "and", "of", "in", "on", "for", "that",
  "this", "i", "you", "he", "she", "we", "they", "was", "were", "be", "been",
  "being", "am", "are", "do", "does", "did", "have", "has", "had", "with",
  "as", "at", "by", "from", "or", "but", "if", "not", "so", "my", "your",
  "his", "her", "its", "our", "their",
]);

function tokenizeForInsights(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}'-]+/gu) ?? [];
}

function buildFillerRegex(fillerWords: string[]): RegExp | null {
  const cleaned = fillerWords.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const alternation = cleaned
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(?:${alternation.join("|")})\\b`, "gi");
}

function mostUsedWords(
  transcriptions: Transcription[],
  fillerWords: string[],
  limit = 12
): Array<{ word: string; count: number }> {
  const fillerRe = buildFillerRegex(fillerWords);
  const counts = new Map<string, number>();
  for (const t of transcriptions) {
    const withoutFillers = fillerRe ? t.text.replace(fillerRe, " ") : t.text;
    for (const word of tokenizeForInsights(withoutFillers)) {
      if (INSIGHTS_STOP_WORDS.has(word) || word.length < 2) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

function countFillerWords(text: string, fillerWords: string[]): number {
  const re = buildFillerRegex(fillerWords);
  if (!re) return 0;
  return (text.match(re) ?? []).length;
}

function vocabularyRichness(transcriptions: Transcription[]): number {
  const words = transcriptions.flatMap((t) => tokenizeForInsights(t.text));
  if (words.length === 0) return 0;
  return new Set(words).size / words.length;
}

function InsightsScreen({ transcriptions, metrics }: InsightsScreenProps) {
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

  const ranges: Array<"7d" | "30d" | "90d" | "all"> = ["7d", "30d", "90d", "all"];

  // Build daily volume data for sparkline (last 30 days)
  const volumeData = useMemo(() => {
    const days = 30;
    const bins = new Array(days).fill(0);
    const now = Date.now();
    transcriptions.forEach((t) => {
      const age = (now - new Date(t.created_at).getTime()) / 86400000;
      const idx = Math.floor(age);
      if (idx >= 0 && idx < days) bins[days - 1 - idx]++;
    });
    return bins;
  }, [transcriptions]);

  const maxVol = Math.max(...volumeData, 1);

  const rangeDays = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : Infinity;
  const inRange = useMemo(() => {
    if (rangeDays === Infinity) return transcriptions;
    const now = Date.now();
    return transcriptions.filter(
      (t) => (now - new Date(t.created_at).getTime()) / 86400000 <= rangeDays
    );
  }, [transcriptions, rangeDays]);
  const priorRange = useMemo(() => {
    if (rangeDays === Infinity) return [];
    const now = Date.now();
    return transcriptions.filter((t) => {
      const age = (now - new Date(t.created_at).getTime()) / 86400000;
      return age > rangeDays && age <= rangeDays * 2;
    });
  }, [transcriptions, rangeDays]);

  const fillerWordsForInsights = useMemo(() => getFillerWords(), []);
  const topWords = useMemo(
    () => mostUsedWords(inRange, fillerWordsForInsights),
    [inRange, fillerWordsForInsights]
  );
  const richnessCurrent = useMemo(() => vocabularyRichness(inRange), [inRange]);
  const richnessPrevious = useMemo(
    () => (rangeDays === Infinity ? null : vocabularyRichness(priorRange)),
    [priorRange, rangeDays]
  );
  const richnessDelta = useMemo(() => {
    if (richnessPrevious === null || richnessPrevious === 0) return undefined;
    const pct = Math.round(((richnessCurrent - richnessPrevious) / richnessPrevious) * 100);
    return `${pct >= 0 ? "↑" : "↓"}${Math.abs(pct)}%`;
  }, [richnessCurrent, richnessPrevious]);

  const fillerTrendData = useMemo(() => {
    const days = 30;
    const bins = new Array(days).fill(0);
    const now = Date.now();
    transcriptions.forEach((t) => {
      const age = (now - new Date(t.created_at).getTime()) / 86400000;
      const idx = Math.floor(age);
      if (idx >= 0 && idx < days) {
        bins[days - 1 - idx] += countFillerWords(t.raw_text ?? t.text, fillerWordsForInsights);
      }
    });
    return bins;
  }, [transcriptions, fillerWordsForInsights]);
  const maxFiller = Math.max(...fillerTrendData, 1);

  const wpmTrendData = useMemo(() => {
    const days = 30;
    const sums = new Array(days).fill(0);
    const counts = new Array(days).fill(0);
    const now = Date.now();
    transcriptions.forEach((t) => {
      const age = (now - new Date(t.created_at).getTime()) / 86400000;
      const idx = Math.floor(age);
      if (idx >= 0 && idx < days && t.duration_ms > 0) {
        const wpm = (wordCount(t.text) / t.duration_ms) * 60000;
        sums[days - 1 - idx] += wpm;
        counts[days - 1 - idx]++;
      }
    });
    return sums.map((s, i) => (counts[i] > 0 ? Math.round(s / counts[i]) : 0));
  }, [transcriptions]);
  const maxWpm = Math.max(...wpmTrendData, 1);
  const contextBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    inRange.forEach((t) => {
      const key = t.app_name || "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const restCount = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
    if (restCount > 0) top.push(["Other", restCount]);
    return top;
  }, [inRange]);
  const contextTotal = contextBreakdown.reduce((s, [, c]) => s + c, 0) || 1;
  const CONTEXT_COLORS = ["var(--c-violet)", "var(--c-blue)", "var(--c-mint)", "var(--c-amber)", "var(--c-rose)", "var(--text-4)"];

  return (
    <div className="main fade-in">
      <div className="main-header">
        <div>
          <div className="eyebrow">Analytics</div>
          <h1 className="page-title"><em>Insights</em></h1>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {ranges.map((r) => (
            <button
              key={r}
              className={`btn btn-sm${range === r ? "" : " btn-ghost"}`}
              style={range === r ? { background: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.25)", color: "var(--c-violet)" } : {}}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="main-body stagger">
        {/* Big stats */}
        <div className="stat-grid">
          <Stat value={metrics.totalWords > 0 ? metrics.totalWords.toLocaleString() : "—"} label="Total words" sub="dictated" accent="violet" italic />
          <Stat value={metrics.avgWpm > 0 ? metrics.avgWpm : "—"} unit={metrics.avgWpm > 0 ? "wpm" : undefined} label="Avg. speed" accent="blue" />
          <Stat value={metrics.totalMs > 0 ? fmtMinutes(Math.round(metrics.totalMs * 0.4)) : "—"} label="Time saved" sub="est." accent="amber" />
          <Stat value={metrics.sessions > 0 ? `${metrics.sessions}` : "—"} label="Sessions" sub="total" accent="mint" />
        </div>

        {/* Volume sparkline */}
        <SectionHead label="Daily Volume" />
        <div className="card card-glow" data-accent="violet">
          {transcriptions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-4)", fontSize: 13 }}>
              No data yet — start dictating to see your volume trends.
            </div>
          ) : (
            <svg width="100%" height="80" viewBox={`0 0 ${volumeData.length * 12} 80`} preserveAspectRatio="none">
              {volumeData.map((v, i) => {
                const h = (v / maxVol) * 60;
                return (
                  <rect
                    key={i}
                    x={i * 12}
                    y={70 - h}
                    width={10}
                    height={h + 2}
                    rx={2}
                    fill="rgba(167,139,250,0.4)"
                  />
                );
              })}
            </svg>
          )}
          <div style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
            Last 30 days — {transcriptions.length} total session{transcriptions.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Heatmap */}
        <ActivityHeatmap transcriptions={transcriptions} />

        {/* Context breakdown — which apps you actually dictated into, from real app_name data */}
        <SectionHead label="Context Breakdown" />
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {contextBreakdown.length === 0 ? (
            <div style={{ textAlign: "center", padding: "8px 0", color: "var(--text-4)", fontSize: 13, width: "100%" }}>
              No data yet — start dictating to see which apps you use most.
            </div>
          ) : (
            <>
              <div style={{ textAlign: "center" }}>
                <svg width={100} height={100} viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3.8" />
                  {(() => {
                    let cumulativePct = 0;
                    return contextBreakdown.map(([name, count], i) => {
                      const pct = (count / contextTotal) * 100;
                      const el = (
                        <circle
                          key={name}
                          cx="18" cy="18" r="15.9" fill="none"
                          stroke={CONTEXT_COLORS[i % CONTEXT_COLORS.length]}
                          strokeWidth="3.8"
                          strokeDasharray={`${pct} ${100 - pct}`}
                          strokeDashoffset={-cumulativePct}
                          strokeLinecap="butt"
                          transform="rotate(-90 18 18)"
                        />
                      );
                      cumulativePct += pct;
                      return el;
                    });
                  })()}
                </svg>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{contextTotal} notes</div>
              </div>
              <div style={{ flex: 1 }}>
                {contextBreakdown.map(([name, count], i) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <Chip dot>{name}</Chip>
                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${(count / contextTotal) * 100}%`, height: "100%", background: CONTEXT_COLORS[i % CONTEXT_COLORS.length], borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Communication style */}
        <SectionHead label="Communication Style" />
        <div className="stat-grid">
          <Stat
            value={Math.round(richnessCurrent * 100)}
            unit="%"
            label="Vocabulary richness"
            hint="Unique words ÷ total words in this period — higher means more varied language."
            delta={richnessDelta}
            deltaDown={richnessDelta?.startsWith("↓")}
            accent="violet"
          />
        </div>

        <SectionHead label="Most-Used Words" />
        <div className="card">
          {topWords.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-4)", fontSize: 13 }}>
              No data yet — start dictating to see your most-used words.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topWords.map(({ word, count }, i) => (
                <div key={word} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 18, fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text-2)" }}>{word}</span>
                  <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <SectionHead label="Filler Word Trend" />
        <div className="card">
          <svg width="100%" height="60" viewBox={`0 0 ${fillerTrendData.length * 12} 60`} preserveAspectRatio="none">
            {fillerTrendData.map((v, i) => {
              const h = (v / maxFiller) * 44;
              return <rect key={i} x={i * 12} y={54 - h} width={10} height={h + 2} rx={2} fill="rgba(251,191,36,0.4)" />;
            })}
          </svg>
          <div style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
            Last 30 days — {fillerTrendData.reduce((a, b) => a + b, 0)} filler word{fillerTrendData.reduce((a, b) => a + b, 0) === 1 ? "" : "s"} caught
          </div>
        </div>

        <SectionHead label="Speaking Pace Trend" />
        <div className="card">
          <svg width="100%" height="60" viewBox={`0 0 ${wpmTrendData.length * 12} 60`} preserveAspectRatio="none">
            {wpmTrendData.map((v, i) => {
              const h = (v / maxWpm) * 44;
              return <rect key={i} x={i * 12} y={54 - h} width={10} height={h + 2} rx={2} fill="rgba(125,211,252,0.4)" />;
            })}
          </svg>
          <div style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
            Last 30 days — average words per minute per day
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Template Gallery ─────────────────────────────────────

const TEMPLATE_CATEGORIES = [
  { id: "all",       label: "All",              icon: "ListTree" },
  { id: "starter",   label: "Starter pack",     icon: "Sparkles" },
  { id: "email",     label: "Email & writing",  icon: "Mail" },
  { id: "chat",      label: "Chat & Slack",      icon: "Hash" },
  { id: "ai",        label: "AI rewrites",       icon: "Sparkles" },
  { id: "code",      label: "Code & docs",       icon: "Code" },
  { id: "templates", label: "Templates",         icon: "FileText" },
  { id: "lang",      label: "Translate",         icon: "Languages" },
] as const;

type TemplateCat = typeof TEMPLATE_CATEGORIES[number]["id"];

interface Template {
  id: string;
  cat: string;
  trigger: string;
  action: Command["action"];
  scope: Command["scope"];
  body: string;
  desc: string;
  installs: number;
}

const TEMPLATES: Template[] = [
  { id: "tpl-signoff",    cat: "starter",   trigger: "sign off",      action: "REPLACE",  scope: "email", body: "Thanks,\nWa-Ya",                                                                                     desc: "Adds your signature block.",                        installs: 18412 },
  { id: "tpl-fix",        cat: "starter",   trigger: "fix grammar",   action: "REWRITE",  scope: "all",   body: "Correct grammar and punctuation only. Do not change tone, voice, or word choice.",                    desc: "Clean grammar without rewriting your voice.",       installs: 24091 },
  { id: "tpl-summ",       cat: "starter",   trigger: "summarize",     action: "REWRITE",  scope: "all",   body: "Summarize the dictation into 3 bullet points, keep technical terms verbatim.",                        desc: "Three-bullet TL;DR of whatever you said.",          installs: 16203 },
  { id: "tpl-bullets",    cat: "starter",   trigger: "as bullets",    action: "REWRITE",  scope: "all",   body: "Reformat the dictation as a tight bullet list. Preserve order and emphasis.",                         desc: "Stream-of-consciousness → clean bullets.",          installs: 9871  },
  { id: "tpl-polite",     cat: "email",     trigger: "polite",        action: "REWRITE",  scope: "email", body: "Rewrite the dictation as a polite, professional email. Preserve all facts. Add a friendly opener.",    desc: "Turn a curt voice memo into a warm email.",         installs: 7320  },
  { id: "tpl-decline",    cat: "email",     trigger: "decline",       action: "TEMPLATE", scope: "email", body: "Hi {{name}},\n\nThanks for the invite. {{cursor}}\n\nSorry for any inconvenience.\n\n— Wa-Ya",         desc: "Soften a 'no' into a polite decline.",             installs: 4102  },
  { id: "tpl-followup",   cat: "email",     trigger: "follow up",     action: "TEMPLATE", scope: "email", body: "Hi {{name}},\n\nFollowing up on {{cursor}}. No rush — just wanted to keep this on your radar.\n\n— Wa-Ya", desc: "Light-touch follow-up template.",               installs: 5620  },
  { id: "tpl-intro",      cat: "email",     trigger: "warm intro",    action: "REWRITE",  scope: "email", body: "Format as a warm two-sided introduction email. Lead with mutual context, then the ask. Under 120 words.", desc: "Compose a two-sided email intro.",               installs: 2890  },
  { id: "tpl-shipit",     cat: "chat",      trigger: "ship-it",       action: "REPLACE",  scope: "slack", body: "🚢 LGTM — shipping.",                                                                                  desc: "The classic.",                                      installs: 12450 },
  { id: "tpl-otp",        cat: "chat",      trigger: "on my way",     action: "REPLACE",  scope: "slack", body: "omw 🏃",                                                                                               desc: "Casual 'on my way' for Slack.",                    installs: 3104  },
  { id: "tpl-standup",    cat: "templates", trigger: "standup",       action: "TEMPLATE", scope: "slack", body: "Yesterday: {{cursor}}\nToday:\nBlockers:",                                                             desc: "Daily standup template.",                           installs: 8412  },
  { id: "tpl-firmer",     cat: "ai",        trigger: "firmer",        action: "REWRITE",  scope: "all",   body: "Rewrite this with more conviction. Remove hedges ('I think', 'maybe', 'just'). Keep the meaning.",    desc: "Strip hedges and weak qualifiers.",                 installs: 6210  },
  { id: "tpl-shorter",    cat: "ai",        trigger: "shorter",       action: "REWRITE",  scope: "all",   body: "Rewrite this in half as many words. Preserve every important fact.",                                   desc: "Compress to half the length.",                      installs: 9420  },
  { id: "tpl-friendlier", cat: "ai",        trigger: "friendlier",    action: "REWRITE",  scope: "all",   body: "Rewrite this with a warmer, more casual tone. Sound human, not corporate.",                            desc: "Warm up corporate-speak.",                          installs: 4501  },
  { id: "tpl-action",     cat: "ai",        trigger: "action items",  action: "REWRITE",  scope: "all",   body: "Extract action items. Format as 'TODO: <action> — owner: <name> — due: <date>'.",                    desc: "Pull TODOs out of a meeting summary.",              installs: 5102  },
  { id: "tpl-log",        cat: "code",      trigger: "log it",        action: "REWRITE",  scope: "code",  body: "Format as a single-line structured log: timestamp · level · context · message.",                      desc: "Voice → structured log line.",                      installs: 1620  },
  { id: "tpl-todo",       cat: "code",      trigger: "todo me",       action: "TEMPLATE", scope: "code",  body: "// TODO(wayaa): {{cursor}}",                                                                           desc: "Drop a TODO with your name.",                       installs: 4280  },
  { id: "tpl-comment",    cat: "code",      trigger: "doc this",      action: "REWRITE",  scope: "code",  body: "Convert the dictation into a JSDoc/TSDoc block comment. Include @param and @returns.",                desc: "Speech → JSDoc block.",                             installs: 3690  },
  { id: "tpl-tr-es",      cat: "lang",      trigger: "in Spanish",    action: "REWRITE",  scope: "all",   body: "Translate the dictation to Spanish. Match the register (casual or formal).",                          desc: "Quick translation to Spanish.",                     installs: 2810  },
  { id: "tpl-tr-jp",      cat: "lang",      trigger: "in Japanese",   action: "REWRITE",  scope: "all",   body: "Translate to Japanese. Use polite (です/ます) form unless clearly casual.",                            desc: "Quick translation to Japanese.",                    installs: 1102  },
];

function fmtInstalls(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

interface TemplatesGalleryProps {
  open: boolean;
  onClose: () => void;
  installed: Command[];
  onInstall: (t: Template) => void;
}

function TemplatesGallery({ open, onClose, installed, onInstall }: TemplatesGalleryProps) {
  const [cat, setCat] = useState<TemplateCat>("all");
  const [q, setQ] = useState("");

  const installedTriggers = useMemo(() => new Set(installed.map((c) => c.trigger)), [installed]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      if (cat !== "all" && t.cat !== cat) return false;
      if (!query) return true;
      return (t.trigger + " " + t.desc + " " + t.body).toLowerCase().includes(query);
    });
  }, [cat, q]);

  if (!open) return null;

  const counts: Record<string, number> = {};
  for (const c of TEMPLATE_CATEGORIES) {
    counts[c.id] = c.id === "all" ? TEMPLATES.length : TEMPLATES.filter((t) => t.cat === c.id).length;
  }

  const actionIcon = (action: Command["action"]) =>
    action === "REWRITE" ? <Icons.Sparkles size={13} style={{ color: "var(--c-amber)" }} />
    : action === "TEMPLATE" ? <Icons.FileText size={13} style={{ color: "var(--c-blue)" }} />
    : <Icons.ArrowRight size={13} style={{ color: "var(--c-violet)" }} />;

  const actionLabel = (action: Command["action"]) =>
    action === "REWRITE" ? "AI rewrite" : action === "TEMPLATE" ? "Template" : "Replace";

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3>Template <em>gallery</em></h3>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
              {TEMPLATES.length} curated commands · install with one click, customize anytime.
            </div>
          </div>
          <div className="input" style={{ width: 280 }}>
            <Icons.Search size={14} style={{ color: "var(--text-3)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by trigger or use case…" />
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            <Icons.X size={13} />
          </button>
        </div>

        <div className="modal-body">
          <div className="tpl-sidebar">
            {TEMPLATE_CATEGORIES.map((c) => (
              <div key={c.id} className="tpl-cat" data-active={String(cat === c.id)} onClick={() => setCat(c.id)}>
                <Icons.Sparkles size={13} />
                <span>{c.label}</span>
                <span className="tpl-cat-count">{counts[c.id]}</span>
              </div>
            ))}
            <div style={{ marginTop: "auto", padding: "14px 12px 4px", fontSize: 11, color: "var(--text-4)", lineHeight: 1.5 }}>
              <Icons.Sparkles size={11} style={{ verticalAlign: "middle", marginRight: 4, color: "var(--c-amber)" }} />
              Templates are open-source. Share yours from any command's menu.
            </div>
          </div>

          <div className="tpl-grid">
            {filtered.length === 0 ? (
              <div className="empty" style={{ gridColumn: "span 2" }}>
                <div className="empty-icon"><Icons.Search size={18} /></div>
                <h4>No templates match</h4>
                <p>Try a different category or shorter query.</p>
              </div>
            ) : filtered.map((t) => {
              const isInstalled = installedTriggers.has(t.trigger);
              return (
                <div key={t.id} className="tpl-card" data-installed={String(isInstalled)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="tpl-trigger">"{t.trigger}"</span>
                    <span style={{ flex: 1 }} />
                    {actionIcon(t.action)}
                  </div>
                  <div className="tpl-desc">{t.desc}</div>
                  <div className="tpl-foot">
                    <span>{actionLabel(t.action)}</span>
                    <span style={{ color: "var(--text-4)" }}>·</span>
                    <span>{t.scope === "all" ? "Everywhere" : t.scope}</span>
                    <span style={{ color: "var(--text-4)" }}>·</span>
                    <span>{fmtInstalls(t.installs)} installs</span>
                    <span style={{ flex: 1 }} />
                    {isInstalled ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--c-mint)" }}>
                        <Icons.Check size={11} /> Installed
                      </span>
                    ) : (
                      <button className="btn btn-sm" onClick={() => onInstall(t)} style={{ padding: "3px 9px" }}>
                        <Icons.Plus size={11} /> Install
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Command Palette ──────────────────────────────────────

interface PaletteItem {
  id: string;
  group: string;
  title: string;
  sub?: string;
  icon: keyof typeof Icons;
  kbd?: string[];
  meta?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNav: (v: View) => void;
  onStartDictate: () => void;
  onOpenTemplates: () => void;
  transcriptions: Transcription[];
  commands: Command[];
}

function CommandPalette({ open, onClose, onNav, onStartDictate, onOpenTemplates, transcriptions, commands }: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const all = useMemo((): PaletteItem[] => {
    const actions: PaletteItem[] = [
      { id: "act-ptt",  group: "Actions", title: "Start dictating",         sub: "Push-to-talk overlay",    icon: "Mic",      kbd: ["Ctrl","Shift","F9"], run: onStartDictate },
      { id: "act-tpl",  group: "Actions", title: "Browse template gallery", sub: "Install voice commands",  icon: "Sparkles", run: onOpenTemplates },
      { id: "act-new",  group: "Actions", title: "New voice command",        sub: "Open the editor",         icon: "Plus",     run: () => onNav("commands") },
    ];
    const pages: PaletteItem[] = [
      { id: "p-home",     group: "Pages", title: "Home",     sub: "Today's overview",        icon: "Home",     run: () => onNav("home") },
      { id: "p-history",  group: "Pages", title: "History",  sub: "All transcriptions",      icon: "Clock",    run: () => onNav("history") },
      { id: "p-commands", group: "Pages", title: "Commands", sub: "Voice triggers & macros", icon: "Bolt",     run: () => onNav("commands") },
      { id: "p-insights", group: "Pages", title: "Insights", sub: "Analytics & accuracy",    icon: "BarChart", run: () => onNav("insights") },
      { id: "p-settings", group: "Pages", title: "Settings", sub: "Audio, AI, dictionary",   icon: "Settings", run: () => onNav("settings") },
      { id: "p-account",  group: "Pages", title: "Account",  sub: "Plan, billing, devices",  icon: "CreditCard", run: () => onNav("account") },
    ];
    const cmds: PaletteItem[] = commands.filter((c) => c.enabled).map((c) => ({
      id: "c-" + c.id,
      group: "Voice commands",
      title: `"${c.trigger}"`,
      sub: `${c.actionLabel}: ${c.body.split("\n")[0].slice(0, 60)}`,
      icon: (c.action === "REWRITE" ? "Sparkles" : c.action === "TEMPLATE" ? "FileText" : "ArrowRight") as keyof typeof Icons,
      meta: c.scope === "all" ? "any app" : c.scope,
      run: () => onNav("commands"),
    }));
    const tx: PaletteItem[] = transcriptions.slice(0, 6).map((t) => ({
      id: "t-" + t.id,
      group: "Recent transcriptions",
      title: t.text.slice(0, 60) || "Untitled",
      sub: relativeTime(t.created_at),
      icon: "FileText",
      run: () => onNav("history"),
    }));
    return [...actions, ...pages, ...cmds, ...tx];
  }, [transcriptions, commands, onNav, onStartDictate, onOpenTemplates]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return all;
    const tokens = query.split(/\s+/);
    return all
      .map((item) => {
        const hay = (item.title + " " + (item.sub ?? "") + " " + item.group).toLowerCase();
        const hits = tokens.filter((tok) => hay.includes(tok)).length;
        if (hits < tokens.length) return null;
        const titleHits = tokens.filter((tok) => item.title.toLowerCase().includes(tok)).length;
        return { ...item, _score: titleHits * 10 + hits };
      })
      .filter((x): x is PaletteItem & { _score: number } => x !== null)
      .sort((a, b) => b._score - a._score);
  }, [all, q]);

  const grouped = useMemo(() => {
    const out: { group: string; items: PaletteItem[] }[] = [];
    const seen = new Map<string, number>();
    filtered.forEach((item) => {
      if (!seen.has(item.group)) {
        seen.set(item.group, out.length);
        out.push({ group: item.group, items: [] });
      }
      out[seen.get(item.group)!].items.push(item);
    });
    return out;
  }, [filtered]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    const el = itemsRef.current[active];
    if (el) {
      const parent = el.closest(".palette-results");
      if (parent) {
        const top = el.offsetTop;
        const h = el.offsetHeight;
        if (top < parent.scrollTop) parent.scrollTop = top - 8;
        else if (top + h > parent.scrollTop + parent.clientHeight) parent.scrollTop = top + h - parent.clientHeight + 8;
      }
    }
  }, [active]);

  const runActive = () => {
    const item = flat[active];
    if (item?.run) { item.run(); onClose(); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); runActive(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  if (!open) return null;

  let runningIndex = 0;
  return (
    <div className="palette-scrim" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="palette-input">
          <Icons.Search size={16} style={{ color: "var(--text-3)" }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search commands, transcriptions, pages…" />
          <Kbd keys={["Esc"]} />
        </div>

        <div className="palette-results">
          {grouped.length === 0 && (
            <div style={{ padding: 36, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              No matches for <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>"{q}"</span>
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.group}>
              <div className="palette-section">{g.group}</div>
              {g.items.map((item) => {
                const Icon = Icons[item.icon] ?? Icons.FileText;
                const idx = runningIndex++;
                return (
                  <div key={item.id}
                       ref={(el) => { itemsRef.current[idx] = el; }}
                       className="palette-item"
                       data-active={String(idx === active)}
                       onMouseEnter={() => setActive(idx)}
                       onClick={() => { item.run(); onClose(); }}>
                    <div className="pi-icon"><Icon size={13} /></div>
                    <div className="pi-label">
                      <div className="pi-title">{item.title}</div>
                      {item.sub && <div className="pi-sub">{item.sub}</div>}
                    </div>
                    {item.kbd && <Kbd keys={item.kbd} />}
                    {item.meta && !item.kbd && <span className="pi-meta">{item.meta}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="palette-foot">
          <span><Kbd keys={["↑","↓"]} /> navigate</span>
          <span><Kbd keys={["↵"]} /> open</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: "var(--text-3)" }}>Verba · {flat.length} results</span>
        </div>
      </div>
    </div>
  );
}

// ─── Commands Screen ──────────────────────────────────────

interface CommandsScreenProps {
  commands: Command[];
  setCommands: (cmds: Command[]) => void;
  onOpenTemplates: () => void;
}

function CommandsScreen({ commands, setCommands, onOpenTemplates }: CommandsScreenProps) {
  const [selected, setSelected] = useState<Command | null>(commands[0] ?? null);
  const [pill, setPill] = useState<"all" | "active" | "disabled">("all");
  const [editTrigger, setEditTrigger] = useState(selected?.trigger ?? "");
  const [editBody, setEditBody] = useState(selected?.body ?? "");
  const [editAction, setEditAction] = useState<Command["action"]>(selected?.action ?? "REPLACE");
  const [editScope, setEditScope] = useState<Command["scope"]>(selected?.scope ?? "all");

  useEffect(() => {
    if (selected) {
      setEditTrigger(selected.trigger);
      setEditBody(selected.body);
      setEditAction(selected.action);
      setEditScope(selected.scope);
    }
  }, [selected]);

  function saveSelected() {
    if (!selected) return;
    const updated = commands.map((c) =>
      c.id === selected.id
        ? { ...c, trigger: editTrigger, body: editBody, action: editAction, scope: editScope }
        : c
    );
    setCommands(updated);
    setSelected({ ...selected, trigger: editTrigger, body: editBody, action: editAction, scope: editScope });
  }

  function toggleCommand(id: string) {
    const updated = commands.map((c) => c.id === id ? { ...c, enabled: !c.enabled } : c);
    setCommands(updated);
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, enabled: !prev.enabled } : prev);
  }

  function newCommand() {
    const cmd: Command = {
      id: `cmd_${Date.now()}`,
      trigger: "new command",
      action: "REPLACE",
      actionLabel: "Replace",
      body: "",
      scope: "all",
      enabled: true,
      runs: 0,
      accent: "violet",
    };
    const updated = [cmd, ...commands];
    setCommands(updated);
    setSelected(cmd);
  }

  function deleteSelected() {
    if (!selected) return;
    const updated = commands.filter((c) => c.id !== selected.id);
    setCommands(updated);
    setSelected(updated[0] ?? null);
  }

  const filtered = commands.filter((c) => {
    if (pill === "active") return c.enabled;
    if (pill === "disabled") return !c.enabled;
    return true;
  });

  const actionTypes: Array<{ key: Command["action"]; label: string }> = [
    { key: "REPLACE", label: "Replace" },
    { key: "TEMPLATE", label: "Template" },
    { key: "REWRITE", label: "Rewrite" },
  ];

  const scopes: Array<Command["scope"]> = ["all", "slack", "email", "code", "doc"];

  return (
    <div className="main" style={{ overflow: "hidden" }}>
      <div className="main-header">
        <div>
          <div className="eyebrow">{commands.length} command{commands.length !== 1 ? "s" : ""}</div>
          <h1 className="page-title"><em>Commands</em></h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={onOpenTemplates}>
            <Icons.Sparkles size={13} /> Browse templates
          </button>
          <button className="btn btn-sm btn-primary" onClick={newCommand}>
            <Icons.Plus size={13} /> New command
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ padding: "8px 36px 0", display: "flex", gap: 6 }}>
        {(["all", "active", "disabled"] as const).map((p) => (
          <button
            key={p}
            className={`btn btn-sm${pill === p ? "" : " btn-ghost"}`}
            style={pill === p ? { background: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.25)", color: "var(--c-violet)" } : {}}
            onClick={() => setPill(p)}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", borderTop: "1px solid var(--border)", marginTop: 12 }}>
        {/* Command list */}
        <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div className="empty" style={{ margin: 24 }}>
              <div className="empty-icon"><Icons.Bolt size={22} /></div>
              <h4>No commands</h4>
              <p>Create a command to get started.</p>
            </div>
          ) : (
            filtered.map((cmd) => (
              <div
                key={cmd.id}
                className={`list-row${selected?.id === cmd.id ? " selected" : ""}`}
                style={{ gridTemplateColumns: "1fr" }}
                onClick={() => setSelected(cmd)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: `rgba(167,139,250,0.08)`, border: `1px solid rgba(167,139,250,0.16)`,
                    display: "grid", placeItems: "center", color: "var(--c-violet)",
                  }}>
                    <Icons.Bolt size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      "{cmd.trigger}"
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
                      <Chip tone={cmd.scope === "all" ? undefined : "blue"}>{cmd.scope}</Chip>
                      <span>{cmd.runs} runs</span>
                    </div>
                  </div>
                  <div onClick={(e) => { e.stopPropagation(); toggleCommand(cmd.id); }}>
                    <Toggle on={cmd.enabled} onChange={() => toggleCommand(cmd.id)} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Editor */}
        <div style={{ flex: 1, overflowY: "auto", padding: 28 }}>
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <div style={{ textAlign: "center", color: "var(--text-4)" }}>
                <Icons.Bolt size={36} />
                <p style={{ marginTop: 12, fontSize: 13 }}>Select a command to edit</p>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-4)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 8 }}>
                  Trigger phrase
                </label>
                <div className="input">
                  <input
                    value={editTrigger}
                    onChange={(e) => setEditTrigger(e.target.value)}
                    placeholder="e.g. sign off"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-4)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 8 }}>
                  Action type
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  {actionTypes.map((a) => (
                    <button
                      key={a.key}
                      className={`btn btn-sm${editAction === a.key ? "" : " btn-ghost"}`}
                      style={editAction === a.key ? { background: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.25)", color: "var(--c-violet)" } : {}}
                      onClick={() => setEditAction(a.key)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-4)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 8 }}>
                  Body
                </label>
                <div className="input" style={{ alignItems: "flex-start" }}>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={5}
                    placeholder="What gets typed or inserted…"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 13, resize: "vertical", width: "100%" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-4)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 8 }}>
                  Scope
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {scopes.map((s) => (
                    <button
                      key={s}
                      className={`btn btn-sm${editScope === s ? "" : " btn-ghost"}`}
                      style={editScope === s ? { background: "rgba(125,211,252,0.12)", borderColor: "rgba(125,211,252,0.25)", color: "var(--c-blue)" } : {}}
                      onClick={() => setEditScope(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="card" style={{ background: "var(--surface-2)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-4)", fontFamily: "var(--font-mono)", marginBottom: 8 }}>Preview</div>
                <div style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-2)", whiteSpace: "pre-wrap" }}>
                  {editBody || <span style={{ color: "var(--text-4)" }}>No body defined</span>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={saveSelected}>
                  <Icons.Check size={13} /> Save changes
                </button>
                <button className="btn btn-ghost" style={{ color: "var(--c-rose)", borderColor: "rgba(251,113,133,0.2)" }} onClick={deleteSelected}>
                  <Icons.Trash size={13} /> Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Settings Screen ──────────────────────────────────────

type SettingsTab = "general" | "audio" | "hotkeys" | "ai" | "dictionary" | "privacy";

function useSetting(key: string, def: string): [string, (v: string) => void] {
  const [val, setVal] = useState(() => getSetting(key, def));
  function update(v: string) {
    setVal(v);
    setSetting(key, v);
  }
  return [val, update];
}

function useToggleSetting(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState(() => getSetting(key, def ? "true" : "false") === "true");
  function update(v: boolean) {
    setVal(v);
    setSetting(key, v ? "true" : "false");
  }
  return [val, update];
}

function GeneralPanel() {
  const [launchLogin, setLaunchLogin] = useToggleSetting("launch_login", true);
  const [menuBar, setMenuBar] = useToggleSetting("menu_bar", true);
  const [appearance, setAppearance] = useSetting("appearance", "system");
  const [language, setLanguage] = useSetting("language", "en-US");
  const [autoDetect, setAutoDetect] = useToggleSetting("auto_detect_lang", false);

  return (
    <div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Launch at login</p>
          <p className="d">Start Verba automatically when you log in.</p>
        </div>
        <Toggle on={launchLogin} onChange={setLaunchLogin} />
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Show in menu bar</p>
          <p className="d">Keep Verba accessible from the system menu bar.</p>
        </div>
        <Toggle on={menuBar} onChange={setMenuBar} />
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Appearance</p>
          <p className="d">Choose your preferred color scheme.</p>
        </div>
        <select
          value={appearance}
          onChange={(e) => setAppearance(e.target.value)}
          style={{ padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text)" }}
        >
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Primary language</p>
          <p className="d">The main language you dictate in.</p>
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{ padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text)" }}
        >
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
        </select>
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Auto-detect language</p>
          <p className="d">Automatically detect the spoken language each session.</p>
        </div>
        <Toggle on={autoDetect} onChange={setAutoDetect} />
      </div>
    </div>
  );
}

function AudioPanel() {
  const [device, setDevice] = useSetting("input_device", "default");
  const [gain, setGain] = useSetting("gain", "80");
  const [noise, setNoise] = useToggleSetting("noise_suppression", true);
  const [echo, setEcho] = useToggleSetting("echo_cancel", true);
  const [wakeVoice, setWakeVoice] = useToggleSetting("wake_on_voice", false);

  return (
    <div>
      <div className="card card-glow" data-accent="blue" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Live Level</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, height: 32 }}>
          {Array.from({ length: 32 }, (_, i) => {
            const h = Math.abs(Math.sin(i * 0.5)) * 28 + 4;
            return (
              <div key={i} style={{
                width: 4, height: h, borderRadius: 2, flexShrink: 0,
                background: h > 20 ? "var(--c-blue)" : "rgba(125,211,252,0.25)",
              }} />
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>Connect a mic to see live levels</div>
      </div>

      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Input device</p>
          <p className="d">Select your preferred microphone.</p>
        </div>
        <select
          value={device}
          onChange={(e) => setDevice(e.target.value)}
          style={{ padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text)" }}
        >
          <option value="default">System Default</option>
          <option value="builtin">Built-in Microphone</option>
        </select>
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Input gain</p>
          <p className="d">Adjust microphone sensitivity ({gain}%).</p>
        </div>
        <input
          type="range" min="0" max="100" value={gain}
          onChange={(e) => setGain(e.target.value)}
          style={{ width: 120 }}
        />
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Noise suppression</p>
          <p className="d">Filter out background noise automatically.</p>
        </div>
        <Toggle on={noise} onChange={setNoise} />
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Echo cancellation</p>
          <p className="d">Reduce echo from speakers picked up by mic.</p>
        </div>
        <Toggle on={echo} onChange={setEcho} />
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Wake on voice</p>
          <p className="d">Automatically start recording when speech is detected.</p>
        </div>
        <Toggle on={wakeVoice} onChange={setWakeVoice} />
      </div>
    </div>
  );
}

function HotkeysPanel() {
  const hotkeys = [
    { name: "Push-to-talk",      keys: ["Ctrl", "Shift", "F9"] },
    { name: "Hands-free toggle", keys: ["Ctrl", "Shift", "F10"] },
    { name: "Cancel recording",  keys: ["Escape"] },
    { name: "Open Verba",        keys: ["Ctrl", "Shift", "S"] },
    { name: "Paste last",        keys: ["Ctrl", "Shift", "V"] },
    { name: "Show history",      keys: ["Ctrl", "Shift", "H"] },
  ];

  return (
    <div>
      {hotkeys.map((h) => (
        <div key={h.name} className="setting-row">
          <div className="setting-text">
            <p className="t">{h.name}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Kbd keys={h.keys} />
            <button className="btn btn-ghost btn-sm">Rebind</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AIPanel({ tier }: { tier: string | null }) {
  const [smartFormat, setSmartFormat] = useToggleSetting("smart_format", true);
  const [punctuation, setPunctuation] = useToggleSetting("punctuation", true);
  const [fillers, setFillers] = useToggleSetting("fillers", true);
  const [tone, setTone] = useSetting("tone", "neutral");
  const [model, setModel] = useSetting("model", "cloud");

  return (
    <div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Smart formatting</p>
          <p className="d">Let AI clean up your dictation for clarity and readability.</p>
        </div>
        <Toggle on={smartFormat} onChange={setSmartFormat} />
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Auto-punctuation</p>
          <p className="d">Automatically add commas, periods, and question marks.</p>
        </div>
        <Toggle on={punctuation} onChange={setPunctuation} />
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Remove filler words</p>
          <p className="d">Strip "um", "uh", "like" from transcripts.</p>
        </div>
        <Toggle on={fillers} onChange={setFillers} />
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Formatting tone</p>
          <p className="d">Guide AI toward your preferred writing style.</p>
        </div>
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          style={{ padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text)" }}
        >
          <option value="neutral">Neutral</option>
          <option value="formal">Formal</option>
          <option value="casual">Casual</option>
          <option value="technical">Technical</option>
        </select>
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Transcription model</p>
          <p className="d">{tier === "tier1" || tier === "tier2" ? "Local models available on your plan." : "Cloud model used for transcription."}</p>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{ padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text)" }}
        >
          <option value="cloud">Cloud (fastest)</option>
          {(tier === "tier1" || tier === "tier2") && <option value="local">Local (private)</option>}
        </select>
      </div>
    </div>
  );
}

function FillerSection() {
  const [enabled, setEnabled] = useToggleSetting("filler_enabled", true);
  const [words, setWords] = useState<string[]>(getFillerWords);
  const [term, setTerm] = useState("");

  function sync(nextEnabled: boolean, nextWords: string[]) {
    import("../lib/tauri").then(({ setFillerConfig }) => setFillerConfig(nextEnabled, nextWords).catch(() => {}));
  }

  function toggleEnabled(v: boolean) {
    setEnabled(v);
    sync(v, words);
  }

  function addWord() {
    const w = term.trim().toLowerCase();
    if (!w || words.includes(w)) return;
    const updated = [...words, w];
    setWords(updated);
    saveFillerWords(updated);
    sync(enabled, updated);
    setTerm("");
  }

  function removeWord(w: string) {
    const updated = words.filter((x) => x !== w);
    setWords(updated);
    saveFillerWords(updated);
    sync(enabled, updated);
  }

  function resetDefault() {
    setWords(DEFAULT_FILLER_WORDS);
    saveFillerWords(DEFAULT_FILLER_WORDS);
    sync(enabled, DEFAULT_FILLER_WORDS);
  }

  return (
    <div style={{ marginTop: 28 }}>
      <SectionHead label="Filler Words" action={<Toggle on={enabled} onChange={toggleEnabled} />} />
      <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 14px" }}>
        Strips these from dictated text before it's pasted.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div className="input" style={{ flex: 1 }}>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addWord()}
            placeholder="Add a word or phrase"
          />
        </div>
        <button className="btn btn-sm btn-primary" onClick={addWord}>
          <Icons.Plus size={13} /> Add
        </button>
        <button className="btn btn-sm btn-ghost" onClick={resetDefault} title="Reset to the default list">
          Reset
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {words.map((w) => (
          <span key={w} className="chip" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {w}
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: 2, color: "var(--c-rose)" }}
              onClick={() => removeWord(w)}
              title={`Remove "${w}"`}
            >
              <Icons.X size={10} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function DictPanel() {
  const [entries, setEntries] = useState<DictEntry[]>(getDictionary);
  const [term, setTerm] = useState("");
  const [phonetic, setPhonetic] = useState("");

  function syncToSidecar(updated: DictEntry[]) {
    const words = updated.map((e) => e.phonetic ? `${e.term} (${e.phonetic})` : e.term);
    import("../lib/tauri").then(({ setDictionary }) => setDictionary(words).catch(() => {}));
  }

  function addEntry() {
    if (!term.trim()) return;
    const entry: DictEntry = { id: `dict_${Date.now()}`, term: term.trim(), phonetic: phonetic.trim() };
    const updated = [...entries, entry];
    setEntries(updated);
    saveDictionary(updated);
    syncToSidecar(updated);
    setTerm("");
    setPhonetic("");
  }

  function removeEntry(id: string) {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    saveDictionary(updated);
    syncToSidecar(updated);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <div className="input" style={{ flex: 1 }}>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term or phrase" />
        </div>
        <div className="input" style={{ flex: 1 }}>
          <input value={phonetic} onChange={(e) => setPhonetic(e.target.value)} placeholder="Phonetic (optional)" />
        </div>
        <button className="btn btn-sm btn-primary" onClick={addEntry}>
          <Icons.Plus size={13} /> Add
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icons.FileText size={22} /></div>
          <h4>No entries yet</h4>
          <p>Add custom words, names, or jargon for better accuracy.</p>
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
          {entries.map((e) => (
            <div key={e.id} className="setting-row" style={{ padding: "12px 18px" }}>
              <div className="setting-text">
                <p className="t">{e.term}</p>
                {e.phonetic && <p className="d">{e.phonetic}</p>}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--c-rose)" }} onClick={() => removeEntry(e.id)}>
                <Icons.Trash size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <FillerSection />
    </div>
  );
}

function PrivacyPanel() {
  const [localFirst, setLocalFirst] = useToggleSetting("local_first", true);
  const [analytics, setAnalytics] = useToggleSetting("analytics", false);
  const [crashReports, setCrashReports] = useToggleSetting("crash_reports", true);
  const [cloudBackup, setCloudBackup] = useToggleSetting("cloud_backup", false);

  return (
    <div>
      <div className="card card-glow" data-accent="mint" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.18)", display: "grid", placeItems: "center", color: "var(--c-mint)", flexShrink: 0 }}>
            <Icons.Shield size={16} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Local-first by default</div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.6 }}>
              Your audio and transcripts never leave your device unless you explicitly enable cloud features.
            </div>
          </div>
          <Toggle on={localFirst} onChange={setLocalFirst} />
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Send analytics</p>
          <p className="d">Help improve Verba with anonymous usage data.</p>
        </div>
        <Toggle on={analytics} onChange={setAnalytics} />
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Crash reports</p>
          <p className="d">Automatically send crash reports to help fix bugs.</p>
        </div>
        <Toggle on={crashReports} onChange={setCrashReports} />
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <p className="t">Cloud backup</p>
          <p className="d">Back up your transcription history to the cloud.</p>
        </div>
        <Toggle on={cloudBackup} onChange={setCloudBackup} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
        <button className="btn btn-sm">
          <Icons.Download size={13} /> Export all data
        </button>
        <button className="btn btn-sm btn-ghost" style={{ color: "var(--c-rose)", borderColor: "rgba(251,113,133,0.2)" }}>
          <Icons.Trash size={13} /> Delete all data
        </button>
      </div>
    </div>
  );
}

function SettingsScreen({ tier, onViewChange }: { tier: string | null; onViewChange?: (v: View) => void }) {
  const [tab, setTab] = useState<SettingsTab>("general");

  const tabs: Array<{ key: SettingsTab; label: string; icon: React.ReactNode }> = [
    { key: "general",    label: "General",      icon: <Icons.Settings size={14} /> },
    { key: "audio",      label: "Audio & Mic",  icon: <Icons.Volume size={14} /> },
    { key: "hotkeys",    label: "Hotkeys",      icon: <Icons.Bolt size={14} /> },
    { key: "ai",         label: "AI & Format",  icon: <Icons.Sparkles size={14} /> },
    { key: "dictionary", label: "Dictionary",   icon: <Icons.FileText size={14} /> },
    { key: "privacy",    label: "Privacy",      icon: <Icons.Shield size={14} /> },
  ];

  // v2 IA: Commands and Account are reached from Settings, not the main rail
  const linkedViews: Array<{ key: View; label: string; icon: React.ReactNode }> = [
    { key: "commands", label: "Commands", icon: <Icons.Bolt size={14} /> },
    { key: "account",  label: "Account",  icon: <Icons.User size={14} /> },
  ];

  function renderPanel() {
    switch (tab) {
      case "general":    return <GeneralPanel />;
      case "audio":      return <AudioPanel />;
      case "hotkeys":    return <HotkeysPanel />;
      case "ai":         return <AIPanel tier={tier} />;
      case "dictionary": return <DictPanel />;
      case "privacy":    return <PrivacyPanel />;
    }
  }

  return (
    <div className="main fade-in">
      <div className="main-header">
        <div>
          <div className="eyebrow">Preferences</div>
          <h1 className="page-title"><em>Settings</em></h1>
        </div>
      </div>

      <div className="main-body" style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
        {/* Sub-nav */}
        <div style={{ width: 200, flexShrink: 0, position: "sticky", top: 0 }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`nav-item${tab === t.key ? " active" : ""}`}
              style={{ width: "100%", marginBottom: 2 }}
              onClick={() => setTab(t.key)}
            >
              <span className="nav-icon">{t.icon}</span>
              <span className="nav-label">{t.label}</span>
            </button>
          ))}
          {onViewChange && (
            <>
              <div style={{ height: 1, background: "var(--border)", margin: "10px 4px" }} />
              {linkedViews.map((t) => (
                <button
                  key={t.key}
                  className="nav-item"
                  style={{ width: "100%", marginBottom: 2 }}
                  onClick={() => onViewChange(t.key)}
                >
                  <span className="nav-icon">{t.icon}</span>
                  <span className="nav-label">{t.label}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Content */}
        <div className="card" style={{ flex: 1 }}>
          {renderPanel()}
        </div>
      </div>
    </div>
  );
}

// ─── Account Screen ───────────────────────────────────────

// ─── Plan definitions ─────────────────────────────────────

interface Plan {
  id: "trial" | "local" | "pro";
  name: string;
  price: string;
  renewal?: string;
  wordLimit: number;
  cloudRewrites: number;
  commandLimit: number;
  dictLimit: number;
  features: string[];
  accent: "amber" | "violet" | "blue";
}

const PLANS: Record<Plan["id"], Plan> = {
  trial: {
    id: "trial",
    name: "Trial",
    price: "Free for 14 days",
    wordLimit: 10000,
    cloudRewrites: 10,
    commandLimit: 10,
    dictLimit: 50,
    features: ["10,000 words / month", "10 cloud rewrites", "10 voice commands", "Local whisper (tiny)"],
    accent: "amber",
  },
  local: {
    id: "local",
    name: "Local",
    price: "$15 one-time",
    wordLimit: 500000,
    cloudRewrites: 0,
    commandLimit: 50,
    dictLimit: 500,
    features: ["Unlimited local dictation", "Local model access", "Command library (50)", "Custom dictionary (500)", "No cloud processing"],
    accent: "blue",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "$99 / year",
    renewal: "Renews May 1, 2027",
    wordLimit: 500000,
    cloudRewrites: 1000,
    commandLimit: 50,
    dictLimit: 500,
    features: [
      "Unlimited dictation",     "Cloud AI formatting",
      "Local model access",      "Priority transcription",
      "Command library (50)",    "Custom dictionary (500)",
      "Multi-device sync",       "Priority support",
    ],
    accent: "violet",
  },
};

function getPlan(tier: string | null): Plan {
  if (!tier || tier === "trial") return PLANS.trial;
  if (tier === "local") return PLANS.local;
  return PLANS.pro;
}

interface AccountScreenProps {
  userName: string;
  userEmail: string;
  tier: string | null;
}

function AccountScreen({ userName, userEmail, tier }: AccountScreenProps) {
  const plan = getPlan(tier);
  const initial = (userName || userEmail || "U")[0].toUpperCase();
  const joinedYear = new Date().getFullYear();

  const words   = parseInt(localStorage.getItem("verba_total_words") ?? "0");
  const sessions = parseInt(localStorage.getItem("verba_sessions") ?? "0");
  const dictLen  = getDictionary().length;
  const cmdLen   = getCommands().length;

  const usageItems = [
    { label: "Words dictated",     value: words,          max: plan.wordLimit,     tone: "violet" },
    { label: "Cloud rewrites",     value: sessions * 2,   max: Math.max(plan.cloudRewrites, 10), tone: "blue" },
    { label: "Dictionary entries", value: dictLen,        max: plan.dictLimit,     tone: "amber" },
    { label: "Commands",           value: cmdLen,         max: plan.commandLimit,  tone: "mint" },
  ];

  const isTrial = plan.id === "trial";
  const isPaid  = plan.id === "pro" || plan.id === "local";

  const billingHistory = isPaid
    ? [
        { date: "May 1, 2026",  desc: `Verba ${plan.name} · Annual`,  amount: plan.price.split(" ")[0], status: "Paid" },
        { date: "Apr 1, 2026",  desc: "Verba Trial",                   amount: "$0.00",  status: "Free" },
      ]
    : [{ date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), desc: "Verba Trial", amount: "$0.00", status: "Free" }];

  const devices = [
    { name: "Windows 11 HP OmniBook", meta: "Current device · Windows 11", lastSeen: "Now", current: true },
  ];

  return (
    <div className="main fade-in">
      <div className="main-header">
        <div>
          <div className="eyebrow">{isTrial ? "Trial Plan" : `${plan.name} Plan`}</div>
          <h1 className="page-title"><em>Account</em></h1>
        </div>
      </div>

      <div className="main-body stagger">
        {/* Profile card */}
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 0 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, #a78bfa, #34d399)", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 700, color: "#0a0a0c", flexShrink: 0 }}>
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400 }}>{userName || "Your Name"}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
              {userEmail || "—"} · Joined {joinedYear}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <Chip tone={plan.accent} dot>{plan.name}</Chip>
              {plan.id === "pro" && <Chip tone="blue">Annual</Chip>}
            </div>
          </div>
          <button className="btn btn-sm">
            <Icons.Edit size={13} /> Edit profile
          </button>
        </div>

        {/* Trial countdown banner */}
        {isTrial && (
          <div style={{
            padding: "14px 20px",
            background: "rgba(251,191,36,0.06)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: "var(--radius-card)",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 3 }}>
                14-day trial · unlimited features unlocked
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                Upgrade before your trial ends to keep all your commands, dictionary, and settings.
              </div>
            </div>
            <button className="btn btn-sm btn-primary" style={{ flexShrink: 0 }}>
              Upgrade to Pro
            </button>
          </div>
        )}

        {/* Plan + Usage */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, marginTop: 0 }}>
          {/* Plan card */}
          <div className={`card${isTrial ? "" : " card-glow"}`} data-accent={plan.accent}>
            <div style={{ marginBottom: 16 }}>
              <Chip tone={plan.accent} dot>Current plan</Chip>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, margin: "0 0 4px" }}>
              Verba{" "}
              <em style={{
                fontStyle: "italic",
                background: "var(--grad-spectrum)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}>
                {plan.name}
              </em>
            </h2>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 18 }}>
              {plan.price}{plan.renewal ? ` · ${plan.renewal}` : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
              {plan.features.map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-2)" }}>
                  <Icons.Check size={12} style={{ color: "var(--c-mint)", flexShrink: 0 }} />
                  {f}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
              {isTrial ? (
                <>
                  <button className="btn btn-sm btn-primary">Upgrade to Pro — $99/yr</button>
                  <button className="btn btn-sm btn-ghost">Local only — $15</button>
                </>
              ) : (
                <>
                  <button className="btn btn-sm btn-primary">Manage plan</button>
                  <button className="btn btn-sm btn-ghost">View invoices</button>
                </>
              )}
            </div>
          </div>

          {/* Usage card */}
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-4)", fontFamily: "var(--font-mono)", marginBottom: 16 }}>Usage</div>
            {usageItems.map((u) => {
              const pct = Math.min(100, (u.value / u.max) * 100);
              const isNear = pct > 80;
              return (
                <div key={u.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: "var(--text-2)" }}>{u.label}</span>
                    <span style={{ color: isNear ? "var(--c-rose)" : "var(--text-4)", fontFamily: "var(--font-mono)" }}>
                      {u.value.toLocaleString()} / {u.max.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      width: `${pct}%`,
                      height: "100%", borderRadius: 2,
                      background: isNear ? "var(--c-rose)" : `var(--c-${u.tone})`,
                      opacity: 0.8,
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Billing */}
        <SectionHead label="Billing History" />
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {billingHistory.map((b, i) => (
            <div key={i} className="setting-row" style={{ padding: "14px 20px", borderBottom: i < billingHistory.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div className="setting-text">
                <p className="t">{b.desc}</p>
                <p className="d" style={{ fontFamily: "var(--font-mono)" }}>{b.date}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{b.amount}</span>
                <Chip tone={b.status === "Paid" ? "mint" : "blue"}>{b.status}</Chip>
                {isPaid && <button className="btn btn-ghost btn-sm"><Icons.Download size={12} /></button>}
              </div>
            </div>
          ))}
        </div>

        {/* Devices */}
        <SectionHead label="Active Devices" />
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {devices.map((d, i) => (
            <div key={i} className="setting-row" style={{ padding: "14px 20px", borderBottom: i < devices.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div className="setting-text">
                <p className="t">{d.name}{" "}{d.current && <Chip tone="mint">This device</Chip>}</p>
                <p className="d" style={{ fontFamily: "var(--font-mono)" }}>{d.meta} · Last seen {d.lastSeen}</p>
              </div>
              {!d.current && (
                <button className="btn btn-ghost btn-sm">Sign out</button>
              )}
            </div>
          ))}
        </div>

        {/* Danger zone */}
        <SectionHead label="Danger Zone" />
        <div className="card" style={{ borderColor: "rgba(251,113,133,0.15)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text)" }}>Delete account</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
                Permanently delete your account and all associated data. This cannot be undone.
              </div>
            </div>
            <button className="btn btn-sm" style={{ color: "var(--c-rose)", borderColor: "rgba(251,113,133,0.25)", flexShrink: 0 }}>
              <Icons.Trash size={13} /> Delete account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────

interface SidebarProps {
  view: View;
  onViewChange: (v: View) => void;
  userName: string;
  tier: string | null;
}

function Sidebar({ view, onViewChange, userName, tier }: SidebarProps) {
  const initial = (userName || "U")[0].toUpperCase();
  const isPro = tier !== null && tier !== "tier1";

  // v2 IA: three destinations (DESIGN.md §2). Insights lives inside History;
  // Commands/Account live inside Settings; Debug opens via Ctrl+Shift+D.
  const navItems: Array<{ key: View; label: string; icon: React.ReactNode }> = [
    { key: "home",     label: "Talk",     icon: <Icons.Mic size={16} /> },
    { key: "history",  label: "History",  icon: <Icons.Clock size={16} /> },
    { key: "settings", label: "Settings", icon: <Icons.Settings size={16} /> },
  ];

  return (
    <div className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <WaveMark size={22} />
        </div>
        <div className="brand-wordmark">Verba</div>
      </div>

      {navItems.map((item) => (
        <button
          key={item.key}
          className={`nav-item${view === item.key ? " active" : ""}`}
          onClick={() => onViewChange(item.key)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="sidebar-footer" onClick={() => onViewChange("account")}>
          <div className="avatar">{initial}</div>
          <div className="sidebar-footer-text">
            <span className="name">{userName || "Your Name"}</span>
            <span className="plan">{isPro ? "Pro" : "Trial"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────

export default function Home() {
  const { tier } = useAppStore();
  const [view, setView] = useState<View>("home");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(getMetrics());
  const [commands, setCommands] = useState<Command[]>(getCommands);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Local mode — no auth
  useEffect(() => {
    setUserEmail("local");
    setUserName("You");
  }, []);

  // Load transcriptions
  useEffect(() => {
    setTranscriptions(getTranscriptions(200));
    setMetrics(getMetrics());
  }, []);

  // Refresh metrics when view changes to home
  useEffect(() => {
    if (view === "home") {
      setTranscriptions(getTranscriptions(200));
      setMetrics(getMetrics());
    }
  }, [view]);

  // Ctrl+K → command palette
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      // Debug is dev-only: hidden from nav, opened via Ctrl+Shift+D (DESIGN.md §2)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        setView((v) => (v === "debug" ? "home" : "debug"));
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setTemplatesOpen(false);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const handleSetCommands = (cmds: Command[]) => {
    setCommands(cmds);
    saveCommands(cmds);
  };

  const installTemplate = (tpl: Template) => {
    if (commands.some((c) => c.trigger === tpl.trigger)) return;
    const accents: Command["accent"][] = ["violet", "blue", "amber", "mint", "rose"];
    const newCmd: Command = {
      id: `cmd_${Date.now()}`,
      trigger: tpl.trigger,
      action: tpl.action,
      actionLabel: tpl.action === "REWRITE" ? "AI rewrite" : tpl.action === "TEMPLATE" ? "Insert template" : "Replace with",
      body: tpl.body,
      scope: tpl.scope,
      enabled: true,
      runs: 0,
      accent: accents[Math.floor(Math.random() * accents.length)],
    };
    const updated = [newCmd, ...commands];
    setCommands(updated);
    saveCommands(updated);
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
      <Sidebar
        view={view}
        onViewChange={setView}
        userName={userName}
        tier={tier}
      />

      {view === "home" && (
        <HomeScreen
          transcriptions={transcriptions}
          metrics={metrics}
          userName={userName}
          onViewChange={setView}
        />
      )}
      {view === "history" && (
        <HistoryView transcriptions={transcriptions} metrics={metrics} />
      )}
      {view === "insights" && (
        <InsightsScreen transcriptions={transcriptions} metrics={metrics} />
      )}
      {view === "commands" && (
        <CommandsScreen
          commands={commands}
          setCommands={handleSetCommands}
          onOpenTemplates={() => setTemplatesOpen(true)}
        />
      )}
      {view === "settings" && (
        <SettingsScreen tier={tier} onViewChange={setView} />
      )}
      {view === "account" && (
        <AccountScreen userName={userName} userEmail={userEmail} tier={tier} />
      )}

      {view === "debug" && (
        <PipelineDebug onClose={() => setView("home")} />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNav={(v) => { setView(v); setPaletteOpen(false); }}
        onStartDictate={() => { setPaletteOpen(false); }}
        onOpenTemplates={() => { setView("commands"); setPaletteOpen(false); setTemplatesOpen(true); }}
        transcriptions={transcriptions}
        commands={commands}
      />

      <TemplatesGallery
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        installed={commands}
        onInstall={installTemplate}
      />
    </div>
  );
}
