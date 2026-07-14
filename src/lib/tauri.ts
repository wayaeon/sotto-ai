import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const startPtt = () => invoke("start_ptt");
export const stopPtt = () => invoke("stop_ptt");
export const toggleHandsfree = () => invoke("toggle_handsfree");
export const pingSidecar = () => invoke("ping_sidecar");
export const detectHardware = () => invoke("detect_hardware");
export const setModel = (model: string) => invoke("set_model", { model });
export const benchmarkModel = (model: string, audioPath?: string | null) => invoke("benchmark_model", { model, audioPath });
export const setDictionary = (words: string[]) => invoke("set_dictionary", { words });
export const injectText = (text: string) => invoke("inject_text", { text });
export const openUrl = (url: string) => invoke("open_url", { url });
export const openPath = (path: string) => invoke("open_path", { path });

export interface StageTiming {
  capture_start_ms?: number;
  capture_end_ms?: number;
  wav_ready_ms?: number;
  worker_sent_ms?: number;
  transcription_done_ms?: number;
  recording_duration_ms?: number;
  wav_write_ms?: number;
  queue_ms?: number;
  whisper_ms?: number;
  inject_ms?: number;
}

export interface HardwareInfo {
  tier: string;
  model: string;
  preferred_model?: string;
  ram_gb: number;
  has_nvidia_cuda?: boolean;
  nvidia_vram_gb?: number;
  free_disk_gb?: number;
  platform?: string;
  platform_release?: string;
  machine?: string;
  cpu_name?: string;
  cpu_cores?: number;
  cpu_threads?: number;
  gpus?: Array<{ name: string; vram_gb?: number }>;
  has_amd_gpu?: boolean;
  has_intel_gpu?: boolean;
  ai_accelerators?: string[];
  detection_notes?: string[];
  device_tier?: string;
  device_str?: string;
}

export interface BenchmarkResult {
  model: string;
  runtime: string;
  device: string;
  compute_type: string;
  load_ms: number;
  transcribe_ms: number;
  audio_duration_ms: number;
  rtf: number;
  text: string;
}

export type SidecarMessage =
  | { event: "ready" }
  | { event: "word"; text: string; partial: boolean }
  | { event: "segment_done"; text: string; audio_path?: string; timing?: StageTiming }
  | { event: "audio_recorded"; audio_path: string }
  | { event: "error"; msg: string }
  | { event: "pong" }
  | { event: "status"; msg: string }
  | ({ event: "hardware" } & HardwareInfo)
  | ({ event: "benchmark_result" } & BenchmarkResult)
  | { event: "audio_level"; level: number };

export function onSidecarEvent(
  handler: (msg: SidecarMessage) => void
): Promise<UnlistenFn> {
  return listen<string>("sidecar-event", (event) => {
    try {
      const msg = JSON.parse(event.payload) as SidecarMessage;
      handler(msg);
    } catch {
      // ignore malformed
    }
  });
}

export interface FocusedAppPayload {
  name: string;
  icon_data_uri: string | null;
  kind: "app" | "site";
}

// Emitted directly by Rust (not via the sidecar's JSON-lines protocol) when a
// PTT or hands-free utterance starts, carrying whatever app/site was focused.
export function onFocusedApp(
  handler: (app: FocusedAppPayload) => void
): Promise<UnlistenFn> {
  return listen<FocusedAppPayload>("focused-app", (event) => handler(event.payload));
}
