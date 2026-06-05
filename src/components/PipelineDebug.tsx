import React, { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openPath } from "@tauri-apps/plugin-shell";
import { listen } from "@tauri-apps/api/event";
import { benchmarkModel, detectHardware, downloadModel, onSidecarEvent, setModel } from "../lib/tauri";
import type { BenchmarkResult, HardwareInfo, StageTiming } from "../lib/tauri";

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

type DebugTab = "pipeline" | "models";

interface ModelCandidate {
  id: string;
  label: string;
  family: string;
  runtime: "faster-whisper" | "nemo" | "transformers" | "onnx" | "mlx" | "cloud";
  accuracyLabel: string;
  expectedLatencyLabel: string;
  sizeLabel: string;
  sourceUrl: string;
  downloadSupported: boolean;
  benchmarkSupported: boolean;
  note: string;
}

const MODEL_CANDIDATES: ModelCandidate[] = [
  { id: "large-v3-turbo", label: "large-v3 turbo CT2", family: "Whisper", runtime: "faster-whisper", accuracyLabel: "94-97%", expectedLatencyLabel: "3-8s CPU", sizeLabel: "~3.1 GB", sourceUrl: "https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2", downloadSupported: true, benchmarkSupported: true, note: "Highest-quality local baseline; best with GPU." },
  { id: "medium.en", label: "medium.en CT2", family: "Whisper", runtime: "faster-whisper", accuracyLabel: "92-96%", expectedLatencyLabel: "1.5-4s CPU", sizeLabel: "~1.5 GB", sourceUrl: "https://huggingface.co/Systran/faster-whisper-medium.en", downloadSupported: true, benchmarkSupported: true, note: "Strong English baseline for CPU testing." },
  { id: "medium", label: "medium CT2", family: "Whisper", runtime: "faster-whisper", accuracyLabel: "91-95%", expectedLatencyLabel: "2-5s CPU", sizeLabel: "~1.5 GB", sourceUrl: "https://huggingface.co/Systran/faster-whisper-medium", downloadSupported: true, benchmarkSupported: true, note: "Multilingual baseline with balanced quality." },
  { id: "small", label: "small CT2", family: "Whisper", runtime: "faster-whisper", accuracyLabel: "86-92%", expectedLatencyLabel: "0.8-2s CPU", sizeLabel: "~460 MB", sourceUrl: "https://huggingface.co/Systran/faster-whisper-small", downloadSupported: true, benchmarkSupported: true, note: "Fast local fallback for lower-power PCs." },
  { id: "base", label: "base CT2", family: "Whisper", runtime: "faster-whisper", accuracyLabel: "78-86%", expectedLatencyLabel: "0.3-1s CPU", sizeLabel: "~145 MB", sourceUrl: "https://huggingface.co/Systran/faster-whisper-base", downloadSupported: true, benchmarkSupported: true, note: "Speed test model; accuracy is limited." },
  { id: "tiny", label: "tiny CT2", family: "Whisper", runtime: "faster-whisper", accuracyLabel: "65-78%", expectedLatencyLabel: "<500ms CPU", sizeLabel: "~75 MB", sourceUrl: "https://huggingface.co/Systran/faster-whisper-tiny", downloadSupported: true, benchmarkSupported: true, note: "Smallest fallback for quick smoke tests." },
  { id: "nvidia/parakeet-tdt-0.6b-v3", label: "TDT 0.6B v3", family: "Parakeet", runtime: "nemo", accuracyLabel: "94-98%", expectedLatencyLabel: "<1s GPU/DirectML", sizeLabel: "~2.4 GB", sourceUrl: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3", downloadSupported: true, benchmarkSupported: true, note: "Best accuracy + speed on GPU/DirectML. Recommended for CUDA and AMD GPU." },
  { id: "nvidia/parakeet-tdt-0.6b-v2", label: "TDT 0.6B v2", family: "Parakeet", runtime: "nemo", accuracyLabel: "93-97%", expectedLatencyLabel: "<1s GPU/DirectML", sizeLabel: "~2.4 GB", sourceUrl: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2", downloadSupported: true, benchmarkSupported: true, note: "Previous Parakeet generation. Good fallback if v3 unavailable." },
  { id: "nvidia/canary-1b-flash", label: "1B Flash", family: "Canary", runtime: "nemo", accuracyLabel: "93-97%", expectedLatencyLabel: "1-3s GPU/DirectML", sizeLabel: "~4.0 GB", sourceUrl: "https://huggingface.co/nvidia/canary-1b-flash", downloadSupported: true, benchmarkSupported: true, note: "Multilingual NeMo model. Slower than Parakeet but broader language support." },
  { id: "distil-whisper/distil-large-v3.5", label: "large-v3.5", family: "Distil-Whisper", runtime: "transformers", accuracyLabel: "91-95%", expectedLatencyLabel: "1-2s GPU/DirectML", sizeLabel: "~1.5 GB", sourceUrl: "https://huggingface.co/distil-whisper/distil-large-v3.5", downloadSupported: true, benchmarkSupported: true, note: "Distilled Whisper — fast on GPU with near-large accuracy." },
  { id: "FunAudioLLM/SenseVoiceSmall", label: "Small", family: "SenseVoice", runtime: "transformers", accuracyLabel: "85-92%", expectedLatencyLabel: "0.5-2s", sizeLabel: "~500 MB", sourceUrl: "https://huggingface.co/FunAudioLLM/SenseVoiceSmall", downloadSupported: true, benchmarkSupported: true, note: "Fast with emotion/language metadata. Uses FunASR runtime." },
  { id: "UsefulSensors/moonshine", label: "Moonshine", family: "Moonshine", runtime: "transformers", accuracyLabel: "80-88%", expectedLatencyLabel: "<500ms", sizeLabel: "~200 MB", sourceUrl: "https://huggingface.co/UsefulSensors/moonshine", downloadSupported: true, benchmarkSupported: true, note: "Ultra-fast English model. Best CPU/DirectML speed option." },
  { id: "csukuangfj/sherpa-onnx-zipformer-en-2023-04-01", label: "Zipformer EN", family: "sherpa-onnx", runtime: "onnx", accuracyLabel: "82-90%", expectedLatencyLabel: "<500ms CPU/NPU", sizeLabel: "~100 MB", sourceUrl: "https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-en-2023-04-01", downloadSupported: true, benchmarkSupported: true, note: "ONNX runtime — works on CPU, DirectML, and NPU. Smallest footprint." },
];

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

function ModelsBenchmarkPanel({
  hardware,
  selectedModel,
  downloading,
  downloadLabels,
  benchmarkingModel,
  results,
  audioPath,
  onRefreshHardware,
  onDownload,
  onActivate,
  onBenchmark,
  onOpenSource,
}: {
  hardware: HardwareInfo | null;
  selectedModel: string;
  downloading: Record<string, number>;
  downloadLabels: Record<string, string>;
  benchmarkingModel: string | null;
  results: BenchmarkResult[];
  audioPath: string | null;
  onRefreshHardware: () => void;
  onDownload: (model: string) => void;
  onActivate: (model: ModelCandidate) => void;
  onBenchmark: (model: string) => void;
  onOpenSource: (url: string) => void;
}) {
  const gpuSummary = hardware?.gpus?.length
    ? hardware.gpus.map((gpu) => `${gpu.name}${gpu.vram_gb ? ` · ${gpu.vram_gb} GB` : ""}`).join(" | ")
    : "unknown";
  const acceleratorSummary = hardware?.ai_accelerators?.length
    ? hardware.ai_accelerators.join(" | ")
    : "none detected";
  const osSummary = hardware
    ? [hardware.platform, hardware.platform_release, hardware.machine].filter(Boolean).join(" ")
    : "unknown";
  const latestResultByModel = new Map<string, BenchmarkResult>();
  results.forEach((result) => {
    if (!latestResultByModel.has(result.model)) latestResultByModel.set(result.model, result);
  });

  return (
    <div style={css.modelsRoot}>
      <div style={css.specPanel}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={css.panelEyebrow}>Machine Specs</div>
          <div style={css.specGrid}>
            <Spec label="OS" value={osSummary} width={118} />
            <Spec label="CPU" value={hardware?.cpu_name ?? "unknown"} width={255} />
            <Spec label="Cores" value={hardware?.cpu_cores && hardware?.cpu_threads ? `${hardware.cpu_cores}C / ${hardware.cpu_threads}T` : "unknown"} width={78} />
            <Spec label="RAM" value={hardware ? `${hardware.ram_gb} GB` : "unknown"} width={78} />
            <Spec label="Disk free" value={hardware?.free_disk_gb != null ? `${hardware.free_disk_gb} GB` : "unknown"} width={92} />
            <Spec label="GPU" value={gpuSummary} width={230} />
            <Spec label="CUDA" value={hardware?.has_nvidia_cuda ? `yes · ${hardware.nvidia_vram_gb ?? 0} GB` : "no"} width={56} />
            <Spec label="DirectML" value={hardware?.device_tier === "directml" ? "yes" : hardware?.device_str === "directml" ? "yes" : "no"} width={56} />
            <Spec label="AMD GPU" value={hardware?.has_amd_gpu ? "yes" : "no"} width={68} />
            <Spec label="AI / NPU" value={acceleratorSummary} width={275} />
            <Spec label="Recommended" value={hardware?.preferred_model ?? hardware?.model ?? "unknown"} width={104} />
          </div>
        </div>
        <button style={css.smallBtn} onClick={onRefreshHardware}>Refresh specs</button>
      </div>

      <div style={css.modelsToolbar}>
        <div>
          <div style={css.panelEyebrow}>Models</div>
          <div style={css.mutedText}>Download saves the model locally. Benchmark is available for faster-whisper models today.</div>
        </div>
        <div style={css.audioBadge}>{audioPath ? "Benchmark WAV ready" : "Record a sample"}</div>
      </div>

      <div style={css.modelsTableWrap}>
        <div style={css.modelsTable}>
          <div style={css.modelTableHead}>Family</div>
          <div style={css.modelTableHead}>Model</div>
          <div style={css.modelTableHead}>Runtime</div>
          <div style={css.modelTableHead}>Size</div>
          <div style={css.modelTableHead}>Accuracy</div>
          <div style={css.modelTableHead}>Latency</div>
          <div style={css.modelTableHead}>Bench</div>
          <div style={css.modelTableHead}>RTF</div>
          <div style={css.modelTableHead}>State</div>
          <div style={css.modelTableHead}>Notes</div>
          <div style={css.modelTableHead}>Actions</div>

        {MODEL_CANDIDATES.map((model) => {
          const progress = downloading[model.id];
          const downloadLabel = downloadLabels[model.id];
          const isDownloading = progress !== undefined && progress < 100;
          const isCachedThisSession = progress !== undefined && progress >= 100;
          const isBenchmarking = benchmarkingModel === model.id;
          const active = selectedModel === model.id;
          const result = latestResultByModel.get(model.id);
          const supportLabel = active && model.benchmarkSupported ? "Active" : model.benchmarkSupported ? "Ready" : "Needs adapter";
          const supportIcon = active && model.benchmarkSupported ? "●" : model.benchmarkSupported ? "✓" : "!";
          const supportColor = active && model.benchmarkSupported ? "#818cf8" : model.benchmarkSupported ? "#34d399" : "#f59e0b";
          const supportBg = active && model.benchmarkSupported ? "rgba(129,140,248,0.14)" : model.benchmarkSupported ? "rgba(52,211,153,0.10)" : "rgba(245,158,11,0.10)";
          const supportBorder = active && model.benchmarkSupported ? "rgba(129,140,248,0.34)" : model.benchmarkSupported ? "rgba(52,211,153,0.28)" : "rgba(245,158,11,0.28)";
          return (
            <React.Fragment key={model.id}>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActiveFirst : {}) }}>
                <span style={css.modelFamilyBadge}>{model.family}</span>
              </div>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActive : {}), flexDirection: "column", alignItems: "flex-start" }}>
                <button style={css.modelNameBtn} onClick={() => onActivate(model)}>
                  <span style={{ ...css.radioDot, background: active ? "#818cf8" : "rgba(255,255,255,0.14)" }} />
                  <span style={css.modelNameText}>{model.label}</span>
                </button>
                {progress !== undefined && (
                  <div style={css.inlineProgress}>
                    <div style={css.progressTrack}>
                      <div style={{ ...css.progressFill, width: `${progress}%` }} />
                    </div>
                    <div style={css.downloadLabel} title={downloadLabel ?? `${progress.toFixed(0)}%`}>
                      {progress >= 100 ? "cached" : downloadLabel ?? `${progress.toFixed(0)}%`}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActive : {}) }}>{model.runtime}</div>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActive : {}) }}>{model.sizeLabel}</div>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActive : {}), ...css.modelNumericCell }}>{model.accuracyLabel}</div>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActive : {}), ...css.modelNumericCell }}>{model.expectedLatencyLabel}</div>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActive : {}), ...css.modelNumericCell }}>
                {isBenchmarking ? "running" : result ? fmtMs(result.transcribe_ms) : "—"}
              </div>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActive : {}), ...css.modelNumericCell }}>{result ? `${result.rtf}x` : "—"}</div>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActive : {}) }}>
                <span
                  style={{ ...css.supportIconBadge, color: supportColor, background: supportBg, borderColor: supportBorder }}
                  title={supportLabel}
                  aria-label={supportLabel}
                >
                  {supportIcon}
                </span>
              </div>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActive : {}), ...css.modelNoteCell }} title={model.note}>{model.note}</div>
              <div style={{ ...css.modelTableCell, ...(active ? css.modelTableCellActiveLast : {}), ...css.modelActions }}>
                <button
                  style={{
                    ...css.tableIconBtn,
                    ...(isDownloading ? css.tableIconBtnActive : {}),
                    ...(isCachedThisSession ? css.tableIconBtnReady : {}),
                    ...(!model.downloadSupported ? css.disabledIconBtn : {}),
                    width: isDownloading ? 42 : 28,
                  }}
                  disabled={!model.downloadSupported || isDownloading || isCachedThisSession}
                  title={
                    !model.downloadSupported
                      ? "Local app download is not wired yet"
                      : isCachedThisSession
                        ? "Cached locally for this session"
                        : `Download/cache locally (${model.sizeLabel})`
                  }
                  aria-label={model.downloadSupported ? `Download ${model.label} locally` : `${model.label} local download is not wired`}
                  onClick={() => onDownload(model.id)}
                >
                  {isDownloading ? `${progress.toFixed(0)}%` : isCachedThisSession ? "✓" : "↓"}
                </button>
                <button
                  style={css.tableIconBtn}
                  title="Open model page"
                  aria-label={`Open ${model.label} model page`}
                  onClick={() => onOpenSource(model.sourceUrl)}
                >
                  ↗
                </button>
                <button
                  style={{
                    ...css.tablePrimaryIconBtn,
                    ...((!model.benchmarkSupported || !audioPath || isBenchmarking) ? css.disabledIconBtn : {}),
                    ...(isBenchmarking ? css.tableIconBtnActive : {}),
                  }}
                  disabled={!model.benchmarkSupported || !audioPath || isBenchmarking}
                  title={!model.benchmarkSupported ? "Benchmark requires a runtime adapter" : audioPath ? "Benchmark latest WAV" : "Record a sample first"}
                  aria-label={`Benchmark ${model.label} against latest WAV`}
                  onClick={() => onBenchmark(model.id)}
                >
                  {isBenchmarking ? "…" : "▶"}
                </button>
              </div>
            </React.Fragment>
          );
        })}
        </div>
      </div>

      <div style={css.resultsPanel}>
        <div style={css.panelEyebrow}>Benchmark Results</div>
        {results.length === 0 ? (
          <div style={css.logEmpty}>No benchmark results yet.</div>
        ) : (
          <div style={css.resultsTable}>
            <div style={css.resultsHead}>Model</div>
            <div style={css.resultsHead}>Device</div>
            <div style={css.resultsHead}>Load</div>
            <div style={css.resultsHead}>Transcribe</div>
            <div style={css.resultsHead}>RTF</div>
            <div style={css.resultsHead}>Text</div>
            {results.map((r, i) => (
              <React.Fragment key={`${r.model}-${i}`}>
                <div style={css.resultCell}>{r.model}</div>
                <div style={css.resultCell}>{r.device} · {r.compute_type}</div>
                <div style={css.resultCell}>{fmtMs(r.load_ms)}</div>
                <div style={css.resultCell}>{fmtMs(r.transcribe_ms)}</div>
                <div style={{ ...css.resultCell, color: r.rtf <= 1 ? "#34d399" : "#f59e0b" }}>{r.rtf}x</div>
                <div style={css.resultText}>{r.text || "—"}</div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Spec({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <div style={{ ...css.specItem, width, maxWidth: width }} title={`${label}: ${value}`}>
      <span style={css.specLabel}>{label}</span>
      <span style={css.specValue}>{value}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PipelineDebug({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<DebugTab>("pipeline");
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [selectedModel, setSelectedModel] = useState("large-v3-turbo");
  const [downloading, setDownloading] = useState<Record<string, number>>({});
  const [downloadLabels, setDownloadLabels] = useState<Record<string, string>>({});
  const [benchmarkingModel, setBenchmarkingModel] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([]);

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

  function handleRefreshHardware() {
    detectHardware().catch(() => addLog("🔴 Failed to request hardware refresh"));
  }

  function handleDownload(model: string) {
    setDownloading(prev => ({ ...prev, [model]: 0 }));
    downloadModel(model).catch(() => addLog(`🔴 Failed to request download for ${model}`));
  }

  function handleActivateModel(model: ModelCandidate) {
    setSelectedModel(model.id);
    if (!model.benchmarkSupported) {
      addLog(`⚠️ ${model.label} can download, but needs a ${model.runtime} benchmark/runtime adapter before activation`);
      return;
    }
    updateStage("model", { status: "active", detail: `Activating ${model.id}…` });
    setModel(model.id)
      .then(() => addLog(`✅ Activation requested: ${model.id}`))
      .catch(() => addLog(`🔴 Failed to activate ${model.id}`));
  }

  function handleOpenModelSource(url: string) {
    openPath(url).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
      addLog(`↗️ Opened source link: ${url}`);
    });
  }

  function handleBenchmark(model: string) {
    if (!audioPathRef.current) {
      addLog("🔴 Record audio before benchmarking");
      return;
    }
    setSelectedModel(model);
    setBenchmarkingModel(model);
    addLog(`🧪 Benchmarking ${model}`);
    benchmarkModel(model, audioPathRef.current).catch(() => {
      setBenchmarkingModel(null);
      addLog(`🔴 Failed to start benchmark for ${model}`);
    });
  }

  function setRecordingAudio(path: string) {
    audioPathRef.current = path;
    setAudioPath(path);
    setAudioSrc(convertFileSrc(path));
    setIsPlaying(false); setPlayPos(0); setDuration(0);
    updateStage("recording", { status: "done", detail: path.split(/[\\/]/).pop() });
  }

  // ── inject-done: emitted by Rust after inject_text completes (all windows) ──
  useEffect(() => {
    const unlisten = listen<{ inject_ms: number }>("inject-done", (e) => {
      const inject_ms = e.payload.inject_ms;
      setLastTiming(prev => {
        if (!prev) return null;
        return { ...prev, inject_ms, _source: prev.whisper_ms ? "sidecar" : "frontend" };
      });
      setWaitingForInject(false);
      updateStage("output", { status: "done", detail: "Injected" });
      setPipelineDone(Date.now());
      addLog(`✅ Inject done — ${fmtMs(inject_ms)}`);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // ── Sidecar events ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSidecarEvent((msg) => {
      switch (msg.event) {
        case "ready":
          addLog("🟢 Sidecar ready");
          break;

        case "hardware": {
          setHardware(msg);
          setSelectedModel(msg.model);
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
          } else if (msg.msg.startsWith("worker_ready")) {
            // e.g. "worker_ready device=cuda compute=float16 runtime=faster-whisper"
            const parts = Object.fromEntries(
              msg.msg.split(" ").slice(1).map(p => p.split("="))
            );
            const device  = parts.device  ?? "cpu";
            const compute = parts.compute ?? "int8";
            const runtime = parts.runtime ?? "faster-whisper";
            let badge: string;
            if (device === "cuda") {
              badge = `⚡ GPU · CUDA · ${compute}`;
            } else if (device === "directml") {
              badge = `🔷 GPU · DirectML · ${runtime}`;
            } else if (device === "npu") {
              badge = `🔮 NPU · ONNX`;
            } else {
              badge = `💻 CPU · ${compute}`;
            }
            updateStage("model", { status: "done", detail: badge });
            addLog(`✅ Worker ready — ${badge}`);
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
          setDownloading(prev => ({ ...prev, [mdl]: pct }));
          if (msg.downloaded_label || msg.total_label) {
            setDownloadLabels(prev => ({
              ...prev,
              [mdl]: `${msg.downloaded_label ?? "0 B"} / ${msg.total_label ?? "unknown"}`,
            }));
          }
          updateStage("model", { status: "active", detail: `Downloading ${mdl} — ${pct.toFixed(0)}%`, progress: pct });
          if (pct >= 100) setTimeout(() => updateStage("model", { status: "done", detail: `${mdl} · ready`, progress: undefined }), 800);
          break;
        }

        case "benchmark_result": {
          setBenchmarkingModel(prev => prev === msg.model ? null : prev);
          setBenchmarkResults(prev => [msg, ...prev].slice(0, 12));
          addLog(`✅ Benchmark ${msg.model}: ${fmtMs(msg.transcribe_ms)} · RTF ${msg.rtf}x`);
          break;
        }

        case "error":
          addLog(`🔴 ${msg.msg}`);
          setBenchmarkingModel(prev => prev ? null : prev);
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
        <div style={css.tabs}>
          <button style={activeTab === "pipeline" ? css.tabActive : css.tabIdle} onClick={() => setActiveTab("pipeline")}>Pipeline</button>
          <button style={activeTab === "models" ? css.tabActive : css.tabIdle} onClick={() => setActiveTab("models")}>Models Benchmark</button>
        </div>
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

      {activeTab === "pipeline" ? (
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
      ) : (
        <div style={css.body}>
          <ModelsBenchmarkPanel
            hardware={hardware}
            selectedModel={selectedModel}
            downloading={downloading}
            downloadLabels={downloadLabels}
            benchmarkingModel={benchmarkingModel}
            results={benchmarkResults}
            audioPath={audioPath}
            onRefreshHardware={handleRefreshHardware}
            onDownload={handleDownload}
            onActivate={handleActivateModel}
            onBenchmark={handleBenchmark}
            onOpenSource={handleOpenModelSource}
          />
        </div>
      )}

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
  tabs: { display: "flex", gap: 6, marginLeft: 10, padding: 3, borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" },
  tabActive: { background: "#1d2440", border: "1px solid rgba(129,140,248,0.45)", borderRadius: 6, color: "#dbe4ff", fontSize: 12, padding: "4px 10px", cursor: "pointer", fontWeight: 700 },
  tabIdle: { background: "transparent", border: "1px solid transparent", borderRadius: 6, color: "#64748b", fontSize: 12, padding: "4px 10px", cursor: "pointer", fontWeight: 600 },
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
  downloadLabel: { marginTop: 3, color: "#94a3b8", fontSize: 9, fontFamily: "monospace", textAlign: "right" as const, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  detailBox: { background: "#0a0f1a", borderRadius: 5, padding: "5px 8px", wordBreak: "break-word", lineHeight: 1.5 },
  detailLabel: { color: "#64748b", fontSize: 11 },
  detailText: { color: "#cbd5e1", fontSize: 12 },
  audioBtn: { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 6, color: "#22c55e", fontSize: 11, padding: "3px 10px", cursor: "pointer", fontWeight: 600 },
  audioBtn2: { background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 6, color: "#93c5fd", fontSize: 11, padding: "3px 8px", cursor: "pointer" },

  // Right: timing + log
  right: { flex: 1, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden", minWidth: 0 },

  // Models benchmark tab
  modelsRoot: { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 },
  specPanel: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, background: "#0a0e1a", border: "1.5px solid #1a2a4a", borderRadius: 10, padding: "10px 12px", flexShrink: 0 },
  panelEyebrow: { fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#60a5fa", marginBottom: 6 },
  specGrid: { display: "flex", flexWrap: "nowrap", gap: 6, overflowX: "auto", paddingBottom: 1 },
  specItem: { display: "flex", flexDirection: "column", gap: 1, minWidth: 0, boxSizing: "border-box" as const, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, padding: "6px 8px", flex: "0 0 auto" },
  specLabel: { color: "#64748b", fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 700 },
  specValue: { display: "block", minWidth: 0, color: "#e2e8f0", fontSize: 11, lineHeight: 1.25, fontFamily: "monospace", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  smallBtn: { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "rgba(255,255,255,0.72)", fontSize: 11, padding: "5px 9px", cursor: "pointer", alignSelf: "flex-start", whiteSpace: "nowrap" as const },
  primarySmallBtn: { background: "rgba(99,102,241,0.22)", border: "1px solid rgba(129,140,248,0.38)", borderRadius: 7, color: "#c7d2fe", fontSize: 11, padding: "5px 9px", cursor: "pointer", fontWeight: 700 },
  modelsToolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  mutedText: { color: "#64748b", fontSize: 12 },
  audioBadge: { border: "1px solid rgba(52,211,153,0.22)", background: "rgba(52,211,153,0.08)", color: "#86efac", borderRadius: 99, padding: "5px 10px", fontSize: 11, fontWeight: 700 },
  modelsTableWrap: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflowX: "auto", background: "#0a0e1a" },
  modelsTable: { display: "grid", gridTemplateColumns: "84px minmax(150px, 0.9fr) 104px 72px 86px 92px 58px 46px 68px minmax(280px, 1.45fr) 104px", minWidth: 1250 },
  modelTableHead: { color: "#64748b", fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.08em", padding: "7px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)", whiteSpace: "nowrap" as const },
  modelTableCell: { minWidth: 0, color: "#cbd5e1", fontSize: 12, padding: "7px 8px", borderBottom: "1px solid rgba(255,255,255,0.045)", display: "flex", alignItems: "center", overflow: "hidden" },
  modelTableCellActive: { background: "rgba(99,102,241,0.08)" },
  modelTableCellActiveFirst: { background: "rgba(99,102,241,0.08)", boxShadow: "inset 3px 0 0 #818cf8" },
  modelTableCellActiveLast: { background: "rgba(99,102,241,0.08)" },
  modelNameBtn: { display: "flex", alignItems: "center", gap: 6, minWidth: 0, background: "transparent", border: 0, color: "#e2e8f0", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 650, textAlign: "left" as const },
  modelNameText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  modelFamilyBadge: { maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, color: "#bfdbfe", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" as const, border: "1px solid rgba(96,165,250,0.18)", background: "rgba(96,165,250,0.08)", borderRadius: 99, padding: "3px 7px" },
  modelNumericCell: { justifyContent: "flex-end", fontFamily: "monospace", color: "#e2e8f0" },
  inlineProgress: { width: "calc(100% - 17px)", marginTop: 5, marginLeft: 17, minWidth: 0 },
  radioDot: { width: 9, height: 9, borderRadius: 99, boxShadow: "0 0 0 3px rgba(129,140,248,0.10)" },
  runtimeBadge: { fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.08em" },
  supportIconBadge: { width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid", borderRadius: 99, fontSize: 12, fontWeight: 900, lineHeight: 1, margin: "0 auto" },
  modelNoteCell: { color: "#94a3b8", lineHeight: 1.35, textOverflow: "ellipsis", whiteSpace: "nowrap" as const, paddingRight: 12 },
  modelActions: { gap: 4, justifyContent: "flex-end" },
  tableIconBtn: { width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "rgba(255,255,255,0.72)", fontSize: 13, padding: 0, cursor: "pointer" },
  tableIconBtnActive: { background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.32)", color: "#86efac", fontSize: 10, fontFamily: "monospace", fontWeight: 800 },
  tableIconBtnReady: { background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.28)", color: "#86efac" },
  tablePrimaryIconBtn: { width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(99,102,241,0.22)", border: "1px solid rgba(129,140,248,0.38)", borderRadius: 6, color: "#c7d2fe", fontSize: 12, padding: 0, cursor: "pointer", fontWeight: 800 },
  disabledIconBtn: { opacity: 0.42, cursor: "not-allowed" },
  resultsPanel: { background: "#0a0e1a", border: "1px solid #1e293b", borderRadius: 10, padding: 12 },
  resultsTable: { display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.6fr 0.7fr 0.45fr 2fr", gap: 0, overflowX: "auto" },
  resultsHead: { color: "#64748b", fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.08em", borderBottom: "1px solid #1e293b", padding: "6px 8px" },
  resultCell: { color: "#cbd5e1", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "7px 8px", fontFamily: "monospace" },
  resultText: { color: "#94a3b8", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "7px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },

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
