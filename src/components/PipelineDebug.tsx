import React, { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openPath } from "@tauri-apps/plugin-shell";
import { listen } from "@tauri-apps/api/event";
import { onSidecarEvent } from "../lib/tauri";
import type { StageTiming } from "../lib/tauri";

// ─── Types ───────────────────────────────────────────────────────────────────

type StageStatus = "idle" | "active" | "done" | "error";

interface Stage {
  id: string;
  label: string;
  status: StageStatus;
  detail?: string;
  progress?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(s: StageStatus) {
  if (s === "active") return "#a855f7";
  if (s === "done")   return "#22c55e";
  if (s === "error")  return "#ef4444";
  return "#374151";
}

function statusDot(s: StageStatus) {
  if (s === "active") return "🟣";
  if (s === "done")   return "🟢";
  if (s === "error")  return "🔴";
  return "⚪";
}

function fmtMs(ms: number | undefined): string {
  if (ms === undefined || ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const MODELS_ROOT = `C:\\Users\\wayaa\\.sotto\\models`;

// ─── Timing panel ─────────────────────────────────────────────────────────────

interface TimingRowProps {
  label: string;
  ms: number | undefined;
  maxMs: number;
  color: string;
}

function TimingRow({ label, ms, maxMs, color }: TimingRowProps) {
  const pct = ms !== undefined && maxMs > 0 ? Math.max(1, (ms / maxMs) * 100) : 0;
  return (
    <div style={css.timingRow}>
      <span style={css.timingLabel}>{label}</span>
      <div style={css.timingTrack}>
        <div style={{ ...css.timingFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ ...css.timingVal, color }}>{fmtMs(ms)}</span>
    </div>
  );
}

interface TimingPanelProps {
  timing: StageTiming;
}

function TimingPanel({ timing }: TimingPanelProps) {
  const rows: { label: string; ms: number | undefined; color: string }[] = [
    { label: "Recording",  ms: timing.recording_duration_ms, color: "#7dd3fc" },
    { label: "WAV write",  ms: timing.wav_write_ms,          color: "#94a3b8" },
    { label: "Queue",      ms: timing.queue_ms,               color: "#94a3b8" },
    { label: "Whisper",    ms: timing.whisper_ms,             color: "#a78bfa" },
    { label: "Inject",     ms: timing.inject_ms,              color: "#34d399" },
  ];

  const latencyMs =
    (timing.wav_write_ms  ?? 0) +
    (timing.queue_ms      ?? 0) +
    (timing.whisper_ms    ?? 0) +
    (timing.inject_ms     ?? 0);

  const totalMs =
    (timing.recording_duration_ms ?? 0) + latencyMs;

  const maxMs = Math.max(...rows.map(r => r.ms ?? 0), 1);

  return (
    <div style={css.timingPanel}>
      <div style={css.timingHeader}>Last transcription</div>
      {rows.map(r => (
        <TimingRow key={r.label} label={r.label} ms={r.ms} maxMs={maxMs} color={r.color} />
      ))}
      <div style={css.timingDivider} />
      <div style={css.timingFooter}>
        <span>
          <span style={{ color: "#64748b" }}>Latency </span>
          <span style={{ color: "#a78bfa", fontFamily: "monospace" }}>{fmtMs(latencyMs)}</span>
        </span>
        <span>
          <span style={{ color: "#64748b" }}>Total </span>
          <span style={{ color: "#f1f5f9", fontFamily: "monospace" }}>{fmtMs(totalMs)}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PipelineDebug({ onClose }: { onClose: () => void }) {
  const [stages, setStages] = useState<Stage[]>([
    { id: "model",        label: "1 · Model",     status: "idle" },
    { id: "recording",    label: "2 · Recording", status: "idle" },
    { id: "transcribing", label: "3 · Whisper",   status: "idle" },
    { id: "output",       label: "4 · Output",    status: "idle" },
  ]);

  const [rawWords,  setRawWords]  = useState("");
  const [rawSegment, setRawSegment] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [audioSrc,  setAudioSrc]  = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playPos,   setPlayPos]   = useState(0);
  const [duration,  setDuration]  = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [lastTiming, setLastTiming] = useState<StageTiming | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [transcribeStartMs, setTranscribeStart] = useState<number | null>(null);
  const [elapsedSec, setElapsed] = useState(0);

  const segmentReceivedRef       = useRef(false);
  const audioPathRef             = useRef<string | null>(null);
  const transcriptionFailedRef   = useRef(false);

  // Pipeline stopwatch
  const [pipelineStartMs,  setPipelineStart]   = useState<number | null>(null);
  const [pipelineElapsed,  setPipelineElapsed] = useState<number | null>(null);
  const [pipelineDoneMs,   setPipelineDone]    = useState<number | null>(null);

  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pipelineStartMs === null || pipelineDoneMs !== null) return;
    const id = setInterval(() => setPipelineElapsed(Date.now() - pipelineStartMs), 100);
    return () => clearInterval(id);
  }, [pipelineStartMs, pipelineDoneMs]);

  useEffect(() => {
    if (transcribeStartMs === null) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(Math.round((Date.now() - transcribeStartMs) / 1000)), 500);
    return () => clearInterval(id);
  }, [transcribeStartMs]);

  function addLog(msg: string) {
    setLog(prev => [...prev.slice(-99), `${new Date().toLocaleTimeString()} ${msg}`]);
  }

  function updateStage(id: string, patch: Partial<Stage>) {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  function setRecordingAudio(path: string) {
    audioPathRef.current = path;
    setAudioPath(path);
    setAudioSrc(convertFileSrc(path));
    setIsPlaying(false); setPlayPos(0); setDuration(0);
    updateStage("recording", { status: "done", detail: path.split("\\").pop() });
  }

  // Listen for inject-done timing event (emitted by useSidecar after injection)
  useEffect(() => {
    const unlisten = listen<StageTiming>("inject-done", (e) => {
      setLastTiming(e.payload);
      updateStage("output", { status: "done", detail: "Injected" });
      setPipelineDone(Date.now());
      addLog(`✅ Inject done — Whisper: ${fmtMs(e.payload.whisper_ms)}, Inject: ${fmtMs(e.payload.inject_ms)}, Latency: ${fmtMs((e.payload.wav_write_ms ?? 0) + (e.payload.queue_ms ?? 0) + (e.payload.whisper_ms ?? 0) + (e.payload.inject_ms ?? 0))}`);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Listen to sidecar events
  useEffect(() => {
    const unsub = onSidecarEvent((msg) => {
      switch (msg.event) {
        case "ready":
          addLog("🟢 Sidecar ready");
          break;

        case "hardware": {
          const preferred = (msg as any).preferred_model as string | undefined;
          const detail = preferred && preferred !== msg.model
            ? `${msg.model} (preferred: ${preferred} — not downloaded)`
            : `${msg.model} · ${MODELS_ROOT}\\${msg.model}`;
          updateStage("model", { status: "done", detail });
          addLog(`✅ Model: ${msg.model} (tier ${msg.tier}, ${msg.ram_gb}GB RAM)`);
          if (preferred && preferred !== msg.model)
            addLog(`ℹ️  ${preferred} not downloaded — using ${msg.model} as fallback`);
          break;
        }

        case "status": {
          addLog(`📡 Status → ${msg.msg}`);
          if (msg.msg === "recording_ptt" || msg.msg === "recording") {
            setRawWords("");
            segmentReceivedRef.current = false;
            transcriptionFailedRef.current = false;
            updateStage("recording",    { status: "active", detail: "Listening…" });
            updateStage("transcribing", { status: "idle",   detail: "" });
            updateStage("output",       { status: "idle",   detail: "" });
            setRawSegment("");
            audioPathRef.current = null;
            setAudioPath(null); setAudioSrc(null);
            setIsPlaying(false); setPlayPos(0); setDuration(0);
            setTranscribeStart(null);
            setPipelineStart(Date.now());
            setPipelineDone(null);
            setPipelineElapsed(null);
          } else if (msg.msg === "processing") {
            updateStage("recording",    { status: "done",   detail: "Audio captured" });
            updateStage("transcribing", { status: "active", detail: "Running Whisper…" });
            setTranscribeStart(Date.now());
          } else if (msg.msg === "idle") {
            setTranscribeStart(null);
            if (!audioPathRef.current) updateStage("recording", { status: "idle", detail: "" });
            if (!segmentReceivedRef.current && !transcriptionFailedRef.current)
              updateStage("transcribing", { status: "idle", detail: "⚠️ No speech detected" });
          } else if (msg.msg === "loading_model") {
            updateStage("model", { status: "active", detail: "Loading model from disk…" });
          }
          break;
        }

        case "word":
          setRawWords(prev => prev ? prev + " " + msg.text : msg.text);
          updateStage("transcribing", { status: "active", detail: "Words arriving…" });
          break;

        case "audio_recorded": {
          setRecordingAudio(msg.audio_path);
          addLog(`💾 Recording saved: ${msg.audio_path.split("\\").pop()}`);
          break;
        }

        case "segment_done": {
          segmentReceivedRef.current = true;
          setTranscribeStart(null);
          const raw = msg.text;
          const ap = (msg as any).audio_path as string | undefined;
          if (ap) { setRecordingAudio(ap); addLog(`💾 Recording saved: ${ap.split("\\").pop()}`); }
          setRawSegment(raw);
          updateStage("transcribing", { status: "done", detail: `${raw.trim().split(/\s+/).length} words` });
          updateStage("output", { status: "active", detail: "Injecting…" });
          addLog(`📝 Segment: "${raw.slice(0, 60)}${raw.length > 60 ? "…" : ""}"`);
          // Store partial timing from sidecar; inject_ms will be added via inject-done event
          const sidecarTiming = (msg as any).timing;
          if (sidecarTiming) setLastTiming(sidecarTiming);
          break;
        }

        case "download_progress": {
          const pct = (msg as any).percent as number;
          const mdl = (msg as any).model as string;
          updateStage("model", { status: "active", detail: `Downloading ${mdl} — ${pct.toFixed(0)}%`, progress: pct });
          if (pct >= 100) {
            setTimeout(() => updateStage("model", { status: "done", detail: `${mdl} · ready`, progress: undefined }), 800);
          }
          break;
        }

        case "error":
          addLog(`🔴 Error: ${msg.msg}`);
          if (msg.msg.startsWith("Transcription error:")) {
            transcriptionFailedRef.current = true;
            setTranscribeStart(null);
            updateStage("transcribing", { status: "error", detail: msg.msg });
          }
          break;
      }
    });
    return () => { unsub.then(fn => fn()); };
  }, []);

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [log]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={css.root}>
      {/* Header */}
      <div style={css.header}>
        <span style={css.headerTitle}>Pipeline Debug</span>

        {pipelineStartMs !== null && (
          <span style={{
            fontFamily: "monospace", fontSize: 13, fontWeight: 700, marginLeft: 8,
            color: pipelineDoneMs !== null ? "#4ade80" : "#a78bfa",
          }}>
            {pipelineDoneMs !== null
              ? `✓ ${((pipelineDoneMs - pipelineStartMs) / 1000).toFixed(2)}s total`
              : `⏱ ${((pipelineElapsed ?? 0) / 1000).toFixed(1)}s`}
          </span>
        )}

        <button style={css.closeBtn} onClick={onClose}>✕ Close</button>
      </div>

      <div style={css.body}>
        {/* Left: stages + timing */}
        <div style={css.left}>
          {/* Stage cards */}
          {stages.map(st => (
            <div key={st.id} style={{ ...css.stageCard, borderColor: statusColor(st.status) }}>
              <div style={css.stageTop}>
                <span style={css.stageDot}>{statusDot(st.status)}</span>
                <span style={{ ...css.stageLabel, color: statusColor(st.status) }}>{st.label}</span>
                <span style={css.stageStatus}>{st.status.toUpperCase()}</span>
              </div>

              {st.progress !== undefined && (
                <div style={css.progressTrack}>
                  <div style={{ ...css.progressFill, width: `${st.progress}%` }} />
                </div>
              )}

              {st.id === "transcribing" && st.status === "active" && (
                <div style={css.detailBox}>
                  {rawWords
                    ? <><span style={css.detailLabel}>Live: </span><span style={css.detailText}>{rawWords}</span></>
                    : <span style={css.detailLabel}>Running Whisper… {elapsedSec > 0 ? `${elapsedSec}s` : ""}</span>
                  }
                </div>
              )}
              {st.id === "transcribing" && st.status === "idle" && st.detail && (
                <div style={css.detailBox}>
                  <span style={{ ...css.detailText, color: "#f59e0b" }}>{st.detail}</span>
                </div>
              )}
              {st.id === "transcribing" && st.status === "done" && rawSegment && (
                <div style={css.detailBox}>
                  <span style={css.detailText}>{rawSegment}</span>
                </div>
              )}

              {st.id === "recording" && st.status === "done" && audioSrc && (
                <div style={{ ...css.detailBox, flexDirection: "column", gap: 6, display: "flex" }}>
                  <audio
                    ref={audioRef} src={audioSrc}
                    onLoadedMetadata={e => setDuration((e.target as HTMLAudioElement).duration)}
                    onTimeUpdate={e => setPlayPos((e.target as HTMLAudioElement).currentTime)}
                    onEnded={() => setIsPlaying(false)}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => {
                        if (!audioRef.current) return;
                        if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
                        else { audioRef.current.play(); setIsPlaying(true); }
                      }}
                      style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 6, color: "#22c55e", fontSize: 11, padding: "3px 10px", cursor: "pointer", fontWeight: 600 }}
                    >
                      {isPlaying ? "⏸" : "▶"} {fmtSec(playPos)} / {fmtSec(duration)}
                    </button>
                    <button
                      onClick={() => openPath(audioPath!).catch(() => {})}
                      style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 6, color: "#93c5fd", fontSize: 11, padding: "3px 8px", cursor: "pointer" }}
                    >Open WAV</button>
                    <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 99, cursor: "pointer" }}
                      onClick={e => {
                        if (!audioRef.current || !duration) return;
                        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * duration;
                      }}
                    >
                      <div style={{ height: "100%", background: "#22c55e", borderRadius: 99, width: duration ? `${(playPos / duration) * 100}%` : "0%", transition: "width 0.1s linear" }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: "#334155", wordBreak: "break-all" }}>{audioPath}</span>
                </div>
              )}

              {st.detail && !["transcribing", "recording"].includes(st.id) && (
                <div style={css.detailBox}><span style={css.detailText}>{st.detail}</span></div>
              )}
            </div>
          ))}

          {/* Timing panel */}
          {lastTiming && <TimingPanel timing={lastTiming} />}
        </div>

        {/* Right: event log */}
        <div style={css.logPanel}>
          <div style={{ ...css.logHeader, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Event Log</span>
            <button
              onClick={() => navigator.clipboard.writeText(log.join("\n")).catch(() => {})}
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "rgba(255,255,255,0.6)", fontSize: 11, padding: "2px 8px", cursor: "pointer" }}
            >Copy</button>
          </div>
          <div style={css.logBody} ref={logRef}>
            {log.length === 0 && (
              <div style={css.logEmpty}>Waiting — press Ctrl+Win to dictate</div>
            )}
            {log.map((l, i) => <div key={i} style={css.logLine}>{l}</div>)}
          </div>
        </div>
      </div>

      <div style={css.hint}>
        Press <kbd style={css.kbd}>Ctrl + Win</kbd> to start dictation
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const css: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed", inset: 0,
    background: "#030712", color: "#e5e7eb",
    fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13,
    display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 9999,
  },
  header: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 16px",
    background: "#0f172a", borderBottom: "1px solid #1e293b", flexShrink: 0,
  },
  headerTitle: { fontWeight: 700, fontSize: 15, color: "#f1f5f9" },
  closeBtn: {
    marginLeft: "auto", background: "#1e293b", color: "#94a3b8",
    border: "1px solid #334155", borderRadius: 6, padding: "4px 12px",
    cursor: "pointer", fontSize: 12,
  },
  body: {
    flex: 1, display: "flex", gap: 12, padding: 12, overflow: "hidden",
  },
  left: {
    flex: "0 0 360px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto",
  },
  stageCard: {
    background: "#0f172a", border: "1.5px solid",
    borderRadius: 8, padding: "10px 12px",
    display: "flex", flexDirection: "column", gap: 6, transition: "border-color 0.3s",
  },
  stageTop: { display: "flex", alignItems: "center", gap: 8 },
  stageDot: { fontSize: 14 },
  stageLabel: { fontWeight: 600, flex: 1 },
  stageStatus: { fontSize: 10, color: "#64748b", letterSpacing: "0.08em" },
  progressTrack: { height: 4, background: "#1e293b", borderRadius: 99, overflow: "hidden" },
  progressFill: {
    height: "100%", borderRadius: 99,
    background: "linear-gradient(90deg, #7c3aed, #a855f7)", transition: "width 0.3s",
  },
  detailBox: { background: "#0a0f1a", borderRadius: 5, padding: "5px 8px", wordBreak: "break-word", lineHeight: 1.5 },
  detailLabel: { color: "#64748b", fontSize: 11 },
  detailText: { color: "#cbd5e1", fontSize: 12 },

  // Timing panel
  timingPanel: {
    background: "#0f172a", border: "1.5px solid #1e3a5f",
    borderRadius: 8, padding: "12px 14px",
    display: "flex", flexDirection: "column", gap: 0,
  },
  timingHeader: {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
    textTransform: "uppercase" as const, color: "#4a7ab5", marginBottom: 10,
  },
  timingRow: {
    display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
  },
  timingLabel: {
    width: 70, fontSize: 11, color: "#64748b", flexShrink: 0,
  },
  timingTrack: {
    flex: 1, height: 4, background: "rgba(255,255,255,0.05)",
    borderRadius: 99, overflow: "hidden",
  },
  timingFill: { height: "100%", borderRadius: 99, transition: "width 0.3s" },
  timingVal: {
    width: 58, fontSize: 11, fontFamily: "monospace", textAlign: "right" as const, flexShrink: 0,
  },
  timingDivider: { height: 1, background: "rgba(255,255,255,0.06)", margin: "6px 0" },
  timingFooter: {
    display: "flex", justifyContent: "space-between",
    fontSize: 12, fontWeight: 600,
  },

  // Event log
  logPanel: {
    flex: 1, display: "flex", flexDirection: "column",
    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden",
  },
  logHeader: {
    padding: "8px 12px", borderBottom: "1px solid #1e293b",
    fontWeight: 600, color: "#64748b", fontSize: 11,
    letterSpacing: "0.06em", textTransform: "uppercase" as const, flexShrink: 0,
  },
  logBody: {
    flex: 1, overflowY: "auto", padding: "8px 12px",
    display: "flex", flexDirection: "column", gap: 3,
  },
  logEmpty: { color: "#374151", fontStyle: "italic", padding: "20px 0", textAlign: "center" as const },
  logLine: {
    fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
    fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #0f172a", paddingBottom: 2,
  },
  hint: {
    padding: "8px 16px", background: "#0f172a", borderTop: "1px solid #1e293b",
    color: "#475569", fontSize: 12, flexShrink: 0,
  },
  kbd: {
    background: "#1e293b", border: "1px solid #334155", borderRadius: 4,
    padding: "1px 6px", color: "#e2e8f0", fontFamily: "monospace", fontSize: 12,
  },
};
