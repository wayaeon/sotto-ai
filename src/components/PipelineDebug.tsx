/**
 * PipelineDebug — temporary transcription routing test page.
 * Shows all 6 pipeline stages in real time. Delete after pipeline is verified.
 */
import React, { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openPath } from "@tauri-apps/plugin-shell";
import { onSidecarEvent } from "../lib/tauri";

// ─── Types ────────────────────────────────────────────────────────────────────

type StageStatus = "idle" | "active" | "done" | "error";

interface Stage {
  id: string;
  label: string;
  status: StageStatus;
  detail?: string;
  progress?: number; // 0-100
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusColor(s: StageStatus) {
  if (s === "active") return "#a855f7";   // purple
  if (s === "done")   return "#22c55e";   // green
  if (s === "error")  return "#ef4444";   // red
  return "#374151";                        // gray
}

function statusDot(s: StageStatus) {
  if (s === "active") return "🟣";
  if (s === "done")   return "🟢";
  if (s === "error")  return "🔴";
  return "⚪";
}

const MODELS_ROOT = `C:\\Users\\wayaa\\.sotto\\models`;

function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PipelineDebug({ onClose }: { onClose: () => void }) {

  const [stages, setStages] = useState<Stage[]>([
    { id: "model",       label: "1 · Model",              status: "idle" },
    { id: "recording",   label: "2 · Audio recording",    status: "idle" },
    { id: "transcribing",label: "3 · Transcription",       status: "idle" },
    { id: "preview",     label: "4 · Transcribed text",   status: "idle" },
    { id: "polishing",   label: "5 · AI polish",          status: "polishing" as any, detail: "" },
    { id: "final",       label: "6 · Final output",       status: "idle" },
  ]);

  const [rawWords, setRawWords]         = useState("");
  const [rawSegment, setRawSegment]     = useState("");
  const [finalText, setFinal]           = useState("");
  const [audioPath, setAudioPath]       = useState<string | null>(null);
  const [audioSrc,  setAudioSrc]        = useState<string | null>(null);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [playPos,   setPlayPos]         = useState(0);   // seconds
  const [duration,  setDuration]        = useState(0);   // seconds
  const audioRef                        = useRef<HTMLAudioElement | null>(null);
  const [ollamaEnabled, setOllamaEnabled] = useState(
    () => localStorage.getItem("sotto_llm_enabled") === "true"
  );
  const [log, setLog]                   = useState<string[]>([]);
  const [transcribeStartMs, setTranscribeStart] = useState<number | null>(null);
  const [elapsedSec, setElapsed]        = useState(0);
  const segmentReceivedRef              = useRef(false);
  const audioPathRef                    = useRef<string | null>(null);
  const transcriptionFailedRef          = useRef(false);

  // ── Pipeline-wide stopwatch ──────────────────────────────────────────────
  const [pipelineStartMs, setPipelineStart] = useState<number | null>(null);
  const [pipelineElapsed, setPipelineElapsed] = useState<number | null>(null);
  const [pipelineDoneMs,  setPipelineDone]    = useState<number | null>(null);

  useEffect(() => {
    if (pipelineStartMs === null || pipelineDoneMs !== null) return;
    const id = setInterval(() => {
      setPipelineElapsed(Date.now() - pipelineStartMs);
    }, 100);
    return () => clearInterval(id);
  }, [pipelineStartMs, pipelineDoneMs]);

  const logRef = useRef<HTMLDivElement>(null);

  // Live timer for transcription stage
  useEffect(() => {
    if (transcribeStartMs === null) { setElapsed(0); return; }
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - transcribeStartMs) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [transcribeStartMs]);

  // helper: push a log line
  function addLog(msg: string) {
    setLog((prev) => [...prev.slice(-99), `${new Date().toLocaleTimeString()} ${msg}`]);
  }

  function updateStage(id: string, patch: Partial<Stage>) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function setRecordingAudio(path: string) {
    audioPathRef.current = path;
    setAudioPath(path);
    setAudioSrc(convertFileSrc(path));
    setIsPlaying(false);
    setPlayPos(0);
    setDuration(0);
    updateStage("recording", { status: "done", detail: `Saved -> ${path}` });
  }

  function openAudioRecording() {
    if (!audioPath) return;
    openPath(audioPath).catch((e) => addLog(`⚠️  Failed to open recording: ${e}`));
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setOllamaEnabled(localStorage.getItem("sotto_llm_enabled") === "true");
    // Re-request hardware info on mount — catches case where debug page opens after startup events
    import("../lib/tauri").then(({ detectHardware }) => detectHardware().catch(() => {}));
  }, []);

  // ── listen to sidecar events ───────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSidecarEvent((msg) => {
      switch (msg.event) {
        case "ready":
          addLog("🟢 Sidecar ready");
          break;

        case "hardware": {
          const preferred = (msg as any).preferred_model as string | undefined;
          const detail = preferred && preferred !== msg.model
            ? `${msg.model}  ·  ${MODELS_ROOT}\\${msg.model}  (preferred: ${preferred} — not downloaded)`
            : `${msg.model}  ·  ${MODELS_ROOT}\\${msg.model}`;
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
            updateStage("recording", { status: "active", detail: "Listening…" });
            updateStage("transcribing", { status: "idle", detail: "" });
            updateStage("preview", { status: "idle", detail: "" });
            updateStage("polishing", { status: "idle", detail: "" });
            updateStage("final", { status: "idle", detail: "" });
            setRawSegment("");
            setFinal("");
            audioPathRef.current = null;
            setAudioPath(null);
            setAudioSrc(null);
            setIsPlaying(false);
            setPlayPos(0);
            setDuration(0);
            setTranscribeStart(null);
            // Start pipeline stopwatch
            setPipelineStart(Date.now());
            setPipelineDone(null);
            setPipelineElapsed(null);
          } else if (msg.msg === "processing") {
            updateStage("recording", { status: "done", detail: "Audio captured" });
            updateStage("transcribing", { status: "active", detail: "Running Whisper…" });
            setTranscribeStart(Date.now());
          } else if (msg.msg === "idle") {
            setTranscribeStart(null);
            if (!audioPathRef.current) {
              updateStage("recording", { status: "idle", detail: "" });
            }
            // If we got idle without a segment, the audio was too short / silent
            if (!segmentReceivedRef.current && !transcriptionFailedRef.current) {
              updateStage("transcribing", { status: "idle", detail: "⚠️ No speech detected — hold Ctrl+Win longer" });
            }
          } else if (msg.msg === "loading_model") {
            updateStage("model", { status: "active", detail: "Loading model from disk…" });
          }
          break;
        }

        case "word":
          setRawWords((prev) => (prev ? prev + " " + msg.text : msg.text));
          updateStage("transcribing", { status: "active", detail: "Words arriving…" });
          break;

        case "audio_recorded": {
          setRecordingAudio(msg.audio_path);
          addLog(`💾 Recording saved: ${msg.audio_path}`);
          break;
        }

        case "segment_done": {
          segmentReceivedRef.current = true;
          setTranscribeStart(null);
          const raw = msg.cleanup_text ?? msg.text;
          const ap = (msg as any).audio_path as string | undefined;
          if (ap) {
            setRecordingAudio(ap);
            addLog(`💾 Recording saved: ${ap}`);
          }
          setRawSegment(raw);
          updateStage("transcribing", { status: "done", detail: `${raw.trim().split(/\s+/).length} words` });
          updateStage("preview", { status: "done", detail: raw });

          const llmEnabled = localStorage.getItem("sotto_llm_enabled") === "true";
          if (llmEnabled) {
            updateStage("polishing", { status: "active", detail: "Sending to Ollama…" });
            addLog("🤖 Sending to Ollama for cleanup…");
            const url   = localStorage.getItem("sotto_llm_url")   ?? "http://localhost:11434";
            const mdl   = localStorage.getItem("sotto_llm_model") ?? "qwen3:7b";
            const sysp  = localStorage.getItem("sotto_llm_prompt") ??
              "Clean up the following voice transcription. Fix punctuation, capitalisation, and obvious speech errors. Return only the corrected text, nothing else.";
            fetch(`${url}/api/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: mdl, prompt: `${sysp}\n\n${raw}`, stream: false }),
            })
              .then((r) => r.ok ? r.json() : Promise.reject(r.status))
              .then((data) => {
                const cleaned = (data.response as string)?.trim() || raw;
                setFinal(cleaned);
                updateStage("polishing", { status: "done", detail: `via ${mdl}` });
                updateStage("final", { status: "done", detail: cleaned });
                addLog(`✅ Ollama done (${mdl})`);
                setPipelineDone(Date.now());
              })
              .catch((e) => {
                updateStage("polishing", { status: "error", detail: `Ollama error: ${e}` });
                setFinal(raw);
                updateStage("final", { status: "done", detail: raw });
                addLog(`⚠️  Ollama failed: ${e} — using raw`);
              });
          } else {
            updateStage("polishing", { status: "idle", detail: "Disabled (LLM off)" });
            setFinal(raw);
            updateStage("final", { status: "done", detail: raw });
            addLog("ℹ️  LLM disabled — using raw transcription");
            // Stop pipeline stopwatch
            const now = Date.now();
            setPipelineDone(now);
            setPipelineElapsed((s) => s);
          }
          break;
        }

        case "download_progress": {
          const pct = (msg as any).percent as number;
          const mdl = (msg as any).model as string;
          updateStage("model", {
            status: "active",
            detail: `Downloading ${mdl} — ${pct.toFixed(0)}%`,
            progress: pct,
          });
          if (pct >= 100) {
            setTimeout(() => {
              updateStage("model", {
                status: "done",
                detail: `${mdl}  ·  ${MODELS_ROOT}\\${mdl}`,
                progress: undefined,
              });
            }, 800);
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

    return () => { unsub.then((fn) => fn()); };
  }, []);

  // auto-scroll log
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={css.root}>
      {/* Header */}
      <div style={css.header}>
        <span style={css.headerTitle}>🔬 Pipeline Debug</span>
        <span style={css.badge}>TEMP — delete after verified</span>

        {/* Pipeline stopwatch */}
        {pipelineStartMs !== null && (
          <span style={{
            fontFamily: "'SF Mono', monospace",
            fontSize: 13,
            fontWeight: 700,
            color: pipelineDoneMs !== null ? "#4ade80" : "#a78bfa",
            letterSpacing: 1,
            marginLeft: 4,
          }}>
            {pipelineDoneMs !== null
              ? `✓ ${((pipelineDoneMs - pipelineStartMs) / 1000).toFixed(1)}s`
              : `⏱ ${((pipelineElapsed ?? 0) / 1000).toFixed(1)}s`}
          </span>
        )}

        {/* LLM toggle */}
        <button
          style={{
            marginLeft: 8,
            padding: "3px 10px",
            borderRadius: 6,
            border: ollamaEnabled
              ? "1px solid rgba(167,139,250,0.5)"
              : "1px solid rgba(255,255,255,0.12)",
            background: ollamaEnabled
              ? "rgba(167,139,250,0.15)"
              : "rgba(255,255,255,0.05)",
            color: ollamaEnabled ? "#c4b5fd" : "rgba(255,255,255,0.4)",
            fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}
          onClick={() => {
            const next = !ollamaEnabled;
            setOllamaEnabled(next);
            localStorage.setItem("sotto_llm_enabled", next ? "true" : "false");
          }}
        >
          {ollamaEnabled ? "🤖 LLM on" : "🤖 LLM off"}
        </button>

        <button style={css.closeBtn} onClick={onClose}>✕ Close</button>
      </div>

      <div style={css.body}>
        {/* Stages */}
        <div style={css.stageList}>
          {stages.map((st) => (
            <div key={st.id} style={{ ...css.stageCard, borderColor: statusColor(st.status) }}>
              <div style={css.stageTop}>
                <span style={css.stageDot}>{statusDot(st.status)}</span>
                <span style={{ ...css.stageLabel, color: statusColor(st.status) }}>{st.label}</span>
                <span style={css.stageStatus}>{st.status.toUpperCase()}</span>
              </div>

              {/* progress bar for model download */}
              {st.progress !== undefined && (
                <div style={css.progressTrack}>
                  <div style={{ ...css.progressFill, width: `${st.progress}%` }} />
                </div>
              )}

              {/* detail text — show raw words if transcribing */}
              {st.id === "transcribing" && st.status === "active" && (
                <div style={css.detailBox}>
                  {rawWords
                    ? <><span style={css.detailLabel}>Live words: </span><span style={css.detailText}>{rawWords}</span></>
                    : <span style={css.detailLabel}>Running Whisper… {elapsedSec > 0 ? `(${elapsedSec}s)` : ""}</span>
                  }
                </div>
              )}
              {st.id === "transcribing" && st.status === "idle" && st.detail && (
                <div style={css.detailBox}>
                  <span style={{ ...css.detailText, color: "#f59e0b" }}>{st.detail}</span>
                </div>
              )}

              {st.id === "preview" && rawSegment && (
                <div style={css.detailBox}>
                  <span style={css.detailText}>{rawSegment}</span>
                </div>
              )}

              {st.id === "polishing" && (
                <div style={css.detailBox}>
                  <span style={css.detailLabel}>Status: </span>
                  <span style={css.detailText}>{ollamaEnabled ? (st.detail || "waiting…") : "LLM disabled"}</span>
                </div>
              )}

              {st.id === "final" && finalText && (
                <div style={{ ...css.detailBox, background: "#0d1117" }}>
                  <span style={{ ...css.detailText, color: "#22c55e", fontWeight: 600 }}>{finalText}</span>
                </div>
              )}

              {st.id === "model" && st.detail && (
                <div style={css.detailBox}>
                  <span style={css.detailText}>{st.detail}</span>
                </div>
              )}

              {st.id === "recording" && st.status === "active" && (
                <div style={css.detailBox}>
                  <span style={css.detailText}>Listening…</span>
                </div>
              )}
              {st.id === "recording" && st.status === "done" && audioSrc && (
                <div style={{ ...css.detailBox, display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Hidden audio element */}
                  <audio
                    ref={audioRef}
                    src={audioSrc}
                    onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
                    onTimeUpdate={(e) => setPlayPos((e.target as HTMLAudioElement).currentTime)}
                    onEnded={() => setIsPlaying(false)}
                  />
                  {/* Player controls */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => {
                        if (!audioRef.current) return;
                        if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
                        else { audioRef.current.play(); setIsPlaying(true); }
                      }}
                      style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 6, color: "#22c55e", fontSize: 11, padding: "3px 10px", cursor: "pointer", flexShrink: 0, fontWeight: 600 }}
                    >
                      {isPlaying ? "⏸ Pause" : "▶ Play"}
                    </button>
                    <button
                      onClick={openAudioRecording}
                      title="Open the saved WAV file"
                      style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 6, color: "#93c5fd", fontSize: 11, padding: "3px 10px", cursor: "pointer", flexShrink: 0, fontWeight: 600 }}
                    >
                      Open WAV
                    </button>
                    <span style={{ color: "#64748b", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                      {fmtSec(playPos)} / {fmtSec(duration)}
                    </span>
                    {/* Scrub bar */}
                    <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 99, overflow: "hidden", cursor: "pointer" }}
                      onClick={(e) => {
                        if (!audioRef.current || !duration) return;
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
                      }}
                    >
                      <div style={{ height: "100%", background: "#22c55e", borderRadius: 99, width: duration ? `${(playPos / duration) * 100}%` : "0%", transition: "width 0.1s linear" }} />
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(audioPath!).catch(() => {})}
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "rgba(255,255,255,0.6)", fontSize: 11, padding: "2px 8px", cursor: "pointer", flexShrink: 0 }}
                    >📋</button>
                  </div>
                  <span style={{ ...css.detailText, fontSize: 10, color: "#334155", wordBreak: "break-all" }}>{audioPath}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Event log */}
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
              <div style={css.logEmpty}>Waiting for events… press Ctrl+Win to dictate</div>
            )}
            {log.map((l, i) => (
              <div key={i} style={css.logLine}>{l}</div>
            ))}
          </div>
        </div>
      </div>

      <div style={css.hint}>
        Press <kbd style={css.kbd}>Ctrl + Win</kbd> to start dictation and watch the pipeline run.
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const css: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    background: "#030712",
    color: "#e5e7eb",
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    zIndex: 9999,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
    background: "#0f172a",
    borderBottom: "1px solid #1e293b",
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 15,
    color: "#f1f5f9",
  },
  badge: {
    background: "#7c3aed22",
    color: "#a78bfa",
    border: "1px solid #7c3aed55",
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    flexShrink: 0,
  },
  closeBtn: {
    marginLeft: "auto",
    background: "#1e293b",
    color: "#94a3b8",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "4px 12px",
    cursor: "pointer",
    fontSize: 12,
  },
  body: {
    flex: 1,
    display: "flex",
    gap: 12,
    padding: 12,
    overflow: "hidden",
  },
  stageList: {
    flex: "0 0 380px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflowY: "auto",
  },
  stageCard: {
    background: "#0f172a",
    border: "1.5px solid",
    borderRadius: 8,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    transition: "border-color 0.3s",
  },
  stageTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  stageDot: { fontSize: 14 },
  stageLabel: {
    fontWeight: 600,
    flex: 1,
  },
  stageStatus: {
    fontSize: 10,
    color: "#64748b",
    letterSpacing: "0.08em",
  },
  progressTrack: {
    height: 4,
    background: "#1e293b",
    borderRadius: 99,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #7c3aed, #a855f7)",
    borderRadius: 99,
    transition: "width 0.3s",
  },
  detailBox: {
    background: "#0a0f1a",
    borderRadius: 5,
    padding: "5px 8px",
    wordBreak: "break-word",
    lineHeight: 1.5,
  },
  detailLabel: { color: "#64748b", fontSize: 11 },
  detailText: { color: "#cbd5e1", fontSize: 12 },

  logPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 8,
    overflow: "hidden",
  },
  logHeader: {
    padding: "8px 12px",
    borderBottom: "1px solid #1e293b",
    fontWeight: 600,
    color: "#64748b",
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    flexShrink: 0,
  },
  logBody: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  logEmpty: {
    color: "#374151",
    fontStyle: "italic",
    padding: "20px 0",
    textAlign: "center",
  },
  logLine: {
    fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
    fontSize: 12,
    color: "#94a3b8",
    borderBottom: "1px solid #0f172a",
    paddingBottom: 2,
  },

  hint: {
    padding: "8px 16px",
    background: "#0f172a",
    borderTop: "1px solid #1e293b",
    color: "#475569",
    fontSize: 12,
    flexShrink: 0,
  },
  kbd: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 4,
    padding: "1px 6px",
    color: "#e2e8f0",
    fontFamily: "monospace",
    fontSize: 12,
  },
};
