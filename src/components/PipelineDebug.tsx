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

interface MeasuredTiming extends StageTiming {
  // frontend-measured fallbacks (always populated)
  _fe_recording_ms?: number;
  _fe_whisper_ms?: number;  // approx: processing→segment_done (includes wav+queue)
  _source?: "sidecar" | "frontend";
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

function fmtMs(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtSec(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

// ─── Timing Panel ─────────────────────────────────────────────────────────────

interface TimingRowProps {
  label: string;
  sublabel?: string;
  ms: number | undefined | null;
  maxMs: number;
  color: string;
  pending?: boolean;
}

function TimingBarRow({ label, sublabel, ms, maxMs, color, pending }: TimingRowProps) {
  const pct = ms != null && maxMs > 0 ? Math.max(0.5, (ms / maxMs) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
      <div style={{ width: 130, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: "rgba(235,235,240,0.75)", fontWeight: 500 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{sublabel}</div>}
      </div>
      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 99, overflow: "hidden", margin: "0 12px" }}>
        {ms != null && !pending && (
          <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.4s ease" }} />
        )}
        {pending && (
          <div style={{ height: "100%", width: "30%", background: `${color}55`, borderRadius: 99,
            animation: "shimmer 1.2s ease-in-out infinite", backgroundSize: "200% 100%",
            backgroundImage: `linear-gradient(90deg, ${color}33 25%, ${color}88 50%, ${color}33 75%)` }} />
        )}
      </div>
      <div style={{ width: 68, textAlign: "right", fontFamily: "monospace", fontSize: 12, color: pending ? "#475569" : color, flexShrink: 0 }}>
        {pending ? "pending…" : fmtMs(ms)}
      </div>
    </div>
  );
}

interface TimingPanelProps {
  timing: MeasuredTiming;
  waitingForInject: boolean;
}

function TimingPanel({ timing, waitingForInject }: TimingPanelProps) {
  // Use sidecar fields when available, fall back to frontend measurements
  const recMs     = timing.recording_duration_ms ?? timing._fe_recording_ms;
  const wavMs     = timing.wav_write_ms;
  const queueMs   = timing.queue_ms;
  const whisperMs = timing.whisper_ms ?? timing._fe_whisper_ms;
  const injectMs  = timing.inject_ms;

  const allMs = [recMs, wavMs, queueMs, whisperMs, injectMs].filter(v => v != null) as number[];
  const maxMs = Math.max(...allMs, 1);

  const latencyMs = (wavMs ?? 0) + (queueMs ?? 0) + (whisperMs ?? 0) + (injectMs ?? 0);
  const totalMs   = (recMs ?? 0) + latencyMs;

  const hasSidecarData = timing._source === "sidecar";

  return (
    <div style={css.timingPanel}>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a7ab5" }}>
          Transcription Timing
        </div>
        <div style={{ fontSize: 10, color: hasSidecarData ? "#22c55e" : "#f59e0b",
          background: hasSidecarData ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
          border: `1px solid ${hasSidecarData ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
          borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>
          {hasSidecarData ? "sidecar instrumented" : "frontend measured"}
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <TimingBarRow label="Recording" sublabel="key held duration" ms={recMs} maxMs={maxMs} color="#7dd3fc" />
        {hasSidecarData && (
          <>
            <TimingBarRow label="WAV write" sublabel="disk flush" ms={wavMs} maxMs={maxMs} color="#64748b" />
            <TimingBarRow label="Queue handoff" sublabel="to worker" ms={queueMs} maxMs={maxMs} color="#64748b" />
          </>
        )}
        <TimingBarRow
          label="Whisper inference"
          sublabel={hasSidecarData ? "model only" : "approx (includes wav+queue)"}
          ms={whisperMs}
          maxMs={maxMs}
          color="#a78bfa"
        />
        <TimingBarRow
          label="Text injection"
          sublabel="clipboard + Ctrl+V"
          ms={injectMs}
          maxMs={maxMs}
          color="#34d399"
          pending={waitingForInject}
        />
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "#64748b" }}>
            Pipeline latency
            <span style={{ fontSize: 10, marginLeft: 6, color: "#334155" }}>key release → text injected</span>
          </span>
          <span style={{ fontFamily: "monospace", color: waitingForInject ? "#f59e0b" : "#a78bfa", fontWeight: 700 }}>
            {waitingForInject ? "measuring…" : fmtMs(latencyMs)}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "rgba(235,235,240,0.65)" }}>
            Total
            <span style={{ fontSize: 10, marginLeft: 6, color: "#334155" }}>key press → text injected</span>
          </span>
          <span style={{ fontFamily: "monospace", color: waitingForInject ? "#f59e0b" : "#f1f5f9", fontWeight: 700, fontSize: 14 }}>
            {waitingForInject ? "measuring…" : fmtMs(totalMs)}
          </span>
        </div>
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

  const [rawWords,   setRawWords]   = useState("");
  const [rawSegment, setRawSegment] = useState("");
  const [audioPath,  setAudioPath]  = useState<string | null>(null);
  const [audioSrc,   setAudioSrc]   = useState<string | null>(null);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [playPos,    setPlayPos]    = useState(0);
  const [duration,   setDuration]   = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Timing state
  const [lastTiming,       setLastTiming]       = useState<MeasuredTiming | null>(null);
  const [waitingForInject, setWaitingForInject] = useState(false);

  // Frontend timestamp refs for fallback timing
  const recordingStartRef  = useRef<number | null>(null);
  const processingStartRef = useRef<number | null>(null);

  // Pipeline stopwatch
  const [pipelineStartMs, setPipelineStart]   = useState<number | null>(null);
  const [pipelineElapsed, setPipelineElapsed] = useState<number | null>(null);
  const [pipelineDoneMs,  setPipelineDone]    = useState<number | null>(null);

  const [log, setLog] = useState<string[]>([]);
  const [transcribeStartMs, setTranscribeStart] = useState<number | null>(null);
  const [elapsedSec, setElapsed] = useState(0);

  const segmentReceivedRef     = useRef(false);
  const audioPathRef           = useRef<string | null>(null);
  const transcriptionFailedRef = useRef(false);
  const logRef                 = useRef<HTMLDivElement>(null);

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
    updateStage("recording", { status: "done", detail: path.split(/[\\/]/).pop() });
  }

  // ── Cross-window inject timing via localStorage storage event ──────────────
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "sotto_inject_timing" || !e.newValue) return;
      try {
        const t = JSON.parse(e.newValue) as StageTiming;
        setLastTiming(prev => {
          if (!prev) return null;
          return { ...prev, inject_ms: t.inject_ms, _source: prev.whisper_ms ? "sidecar" : "frontend" };
        });
        setWaitingForInject(false);
        updateStage("output", { status: "done", detail: "Injected" });
        setPipelineDone(Date.now());
        addLog(`✅ Inject done — ${fmtMs(t.inject_ms)}`);
      } catch {}
    };
    window.addEventListener("storage", onStorage);

    // Also try the Tauri event as backup (same-window fallback)
    const unlisten = listen<StageTiming>("inject-done", (e) => {
      setLastTiming(prev => {
        if (!prev) return null;
        return { ...prev, inject_ms: e.payload.inject_ms };
      });
      setWaitingForInject(false);
      updateStage("output", { status: "done", detail: "Injected" });
      setPipelineDone(Date.now());
    });

    return () => {
      window.removeEventListener("storage", onStorage);
      unlisten.then(fn => fn());
    };
  }, []);

  // ── Sidecar events ─────────────────────────────────────────────────────────
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
            : `${msg.model}`;
          updateStage("model", { status: "done", detail });
          addLog(`✅ Model: ${msg.model} (tier ${msg.tier}, ${msg.ram_gb}GB RAM)`);
          break;
        }

        case "status": {
          addLog(`📡 ${msg.msg}`);
          if (msg.msg === "recording_ptt" || msg.msg === "recording") {
            recordingStartRef.current = Date.now();
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
            setLastTiming(null);
            setWaitingForInject(false);
            setPipelineStart(Date.now());
            setPipelineDone(null);
            setPipelineElapsed(null);
          } else if (msg.msg === "processing") {
            processingStartRef.current = Date.now();
            const recMs = recordingStartRef.current ? Date.now() - recordingStartRef.current : undefined;
            updateStage("recording",    { status: "done",   detail: "Audio captured" });
            updateStage("transcribing", { status: "active", detail: "Running Whisper…" });
            setTranscribeStart(Date.now());
            // Pre-populate frontend-measured recording duration
            if (recMs !== undefined) {
              setLastTiming(prev => ({ ...(prev ?? {}), _fe_recording_ms: recMs, _source: "frontend" }));
            }
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

        case "audio_recorded":
          setRecordingAudio(msg.audio_path);
          addLog(`💾 ${msg.audio_path.split(/[\\/]/).pop()}`);
          break;

        case "segment_done": {
          segmentReceivedRef.current = true;
          setTranscribeStart(null);
          const raw = msg.text;
          const ap  = (msg as any).audio_path as string | undefined;
          if (ap) { setRecordingAudio(ap); addLog(`💾 ${ap.split(/[\\/]/).pop()}`); }

          setRawSegment(raw);
          updateStage("transcribing", { status: "done", detail: `${raw.trim().split(/\s+/).length} words` });
          updateStage("output", { status: "active", detail: "Injecting…" });
          setWaitingForInject(true);
          addLog(`📝 "${raw.slice(0, 60)}${raw.length > 60 ? "…" : ""}"`);

          const sidecarTiming = (msg as any).timing as StageTiming | undefined;
          const feWhisperMs = processingStartRef.current ? Date.now() - processingStartRef.current : undefined;
          const feRecMs     = recordingStartRef.current && processingStartRef.current
            ? processingStartRef.current - recordingStartRef.current : undefined;

          if (sidecarTiming && Object.keys(sidecarTiming).length > 0) {
            // Sidecar has instrumented timing — use it
            setLastTiming({ ...sidecarTiming, _source: "sidecar" });
            addLog(`⏱ Whisper: ${fmtMs(sidecarTiming.whisper_ms)} | WAV: ${fmtMs(sidecarTiming.wav_write_ms)} | Queue: ${fmtMs(sidecarTiming.queue_ms)}`);
          } else {
            // Sidecar binary not rebuilt yet — use frontend measurements
            setLastTiming(prev => ({
              ...(prev ?? {}),
              _fe_recording_ms: feRecMs,
              _fe_whisper_ms:   feWhisperMs,
              _source: "frontend",
            }));
            addLog(`⏱ ~Whisper: ${fmtMs(feWhisperMs)} (frontend approx)`);
          }
          break;
        }

        case "download_progress": {
          const pct = (msg as any).percent as number;
          const mdl = (msg as any).model as string;
          updateStage("model", { status: "active", detail: `Downloading ${mdl} — ${pct.toFixed(0)}%`, progress: pct });
          if (pct >= 100) setTimeout(() => updateStage("model", { status: "done", detail: `${mdl} · ready`, progress: undefined }), 800);
          break;
        }

        case "error":
          addLog(`🔴 ${msg.msg}`);
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
        {/* Left: stage cards */}
        <div style={css.left}>
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
                    : <span style={css.detailLabel}>Running Whisper… {elapsedSec > 0 ? `${elapsedSec}s` : ""}</span>}
                </div>
              )}
              {st.id === "transcribing" && st.status === "idle" && st.detail && (
                <div style={css.detailBox}><span style={{ ...css.detailText, color: "#f59e0b" }}>{st.detail}</span></div>
              )}
              {st.id === "transcribing" && st.status === "done" && rawSegment && (
                <div style={css.detailBox}><span style={css.detailText}>{rawSegment}</span></div>
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
                      style={css.audioBtn}
                    >
                      {isPlaying ? "⏸" : "▶"} {fmtSec(playPos)} / {fmtSec(duration)}
                    </button>
                    <button onClick={() => openPath(audioPath!).catch(() => {})} style={css.audioBtn2}>Open WAV</button>
                    <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 99, cursor: "pointer" }}
                      onClick={e => {
                        if (!audioRef.current || !duration) return;
                        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * duration;
                      }}
                    >
                      <div style={{ height: "100%", background: "#22c55e", borderRadius: 99,
                        width: duration ? `${(playPos / duration) * 100}%` : "0%", transition: "width 0.1s linear" }} />
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
        </div>

        {/* Right: timing panel (top) + event log (bottom) */}
        <div style={css.right}>
          {/* Timing — always visible, populates as pipeline runs */}
          {lastTiming ? (
            <TimingPanel timing={lastTiming} waitingForInject={waitingForInject} />
          ) : (
            <div style={{ ...css.timingPanel, display: "flex", alignItems: "center", justifyContent: "center", color: "#374151", fontSize: 13, fontStyle: "italic" }}>
              Press Ctrl+Win to see timing breakdown
            </div>
          )}

          {/* Event log */}
          <div style={css.logPanel}>
            <div style={{ ...css.logHeader, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Event Log</span>
              <button
                onClick={() => navigator.clipboard.writeText(log.join("\n")).catch(() => {})}
                style={css.logCopyBtn}
              >Copy</button>
            </div>
            <div style={css.logBody} ref={logRef}>
              {log.length === 0 && <div style={css.logEmpty}>Waiting — press Ctrl+Win to dictate</div>}
              {log.map((l, i) => <div key={i} style={css.logLine}>{l}</div>)}
            </div>
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
    position: "fixed", inset: 0, background: "#030712", color: "#e5e7eb",
    fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13,
    display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 9999,
  },
  header: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 16px", background: "#0f172a",
    borderBottom: "1px solid #1e293b", flexShrink: 0,
  },
  headerTitle: { fontWeight: 700, fontSize: 15, color: "#f1f5f9" },
  closeBtn: {
    marginLeft: "auto", background: "#1e293b", color: "#94a3b8",
    border: "1px solid #334155", borderRadius: 6, padding: "4px 12px",
    cursor: "pointer", fontSize: 12,
  },
  body: { flex: 1, display: "flex", gap: 12, padding: 12, overflow: "hidden" },

  // Left: stage cards
  left: { flex: "0 0 340px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" },
  stageCard: {
    background: "#0f172a", border: "1.5px solid", borderRadius: 8,
    padding: "10px 12px", display: "flex", flexDirection: "column",
    gap: 6, transition: "border-color 0.3s", flexShrink: 0,
  },
  stageTop: { display: "flex", alignItems: "center", gap: 8 },
  stageDot: { fontSize: 14 },
  stageLabel: { fontWeight: 600, flex: 1 },
  stageStatus: { fontSize: 10, color: "#64748b", letterSpacing: "0.08em" },
  progressTrack: { height: 4, background: "#1e293b", borderRadius: 99, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 99, background: "linear-gradient(90deg, #7c3aed, #a855f7)", transition: "width 0.3s" },
  detailBox: { background: "#0a0f1a", borderRadius: 5, padding: "5px 8px", wordBreak: "break-word", lineHeight: 1.5 },
  detailLabel: { color: "#64748b", fontSize: 11 },
  detailText: { color: "#cbd5e1", fontSize: 12 },
  audioBtn: { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 6, color: "#22c55e", fontSize: 11, padding: "3px 10px", cursor: "pointer", fontWeight: 600 },
  audioBtn2: { background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 6, color: "#93c5fd", fontSize: 11, padding: "3px 8px", cursor: "pointer" },

  // Right: timing + log
  right: { flex: 1, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden", minWidth: 0 },

  // Timing panel
  timingPanel: {
    background: "#0a0e1a", border: "1.5px solid #1a2a4a",
    borderRadius: 10, padding: "16px 18px", flexShrink: 0,
  },

  // Event log
  logPanel: {
    flex: 1, display: "flex", flexDirection: "column",
    background: "#0f172a", border: "1px solid #1e293b",
    borderRadius: 8, overflow: "hidden", minHeight: 0,
  },
  logHeader: {
    padding: "8px 12px", borderBottom: "1px solid #1e293b",
    fontWeight: 600, color: "#64748b", fontSize: 11,
    letterSpacing: "0.06em", textTransform: "uppercase" as const, flexShrink: 0,
  },
  logCopyBtn: { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "rgba(255,255,255,0.6)", fontSize: 11, padding: "2px 8px", cursor: "pointer" },
  logBody: { flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 3 },
  logEmpty: { color: "#374151", fontStyle: "italic", padding: "20px 0", textAlign: "center" as const },
  logLine: { fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace", fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #0f172a", paddingBottom: 2 },

  hint: { padding: "8px 16px", background: "#0f172a", borderTop: "1px solid #1e293b", color: "#475569", fontSize: 12, flexShrink: 0 },
  kbd: { background: "#1e293b", border: "1px solid #334155", borderRadius: 4, padding: "1px 6px", color: "#e2e8f0", fontFamily: "monospace", fontSize: 12 },
};
