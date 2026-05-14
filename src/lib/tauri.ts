import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const startPtt = () => invoke("start_ptt");
export const stopPtt = () => invoke("stop_ptt");
export const toggleHandsfree = () => invoke("toggle_handsfree");
export const pingSidecar = () => invoke("ping_sidecar");
export const detectHardware = () => invoke("detect_hardware");

export type SidecarMessage =
  | { event: "ready" }
  | { event: "word"; text: string; partial: boolean }
  | { event: "segment_done"; text: string; cleanup_text?: string }
  | { event: "error"; msg: string }
  | { event: "pong" }
  | { event: "status"; msg: string }
  | { event: "hardware"; tier: string; model: string; ram_gb: number }
  | { event: "download_progress"; model: string; percent: number };

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
