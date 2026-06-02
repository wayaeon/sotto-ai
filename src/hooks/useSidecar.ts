import { useEffect, useRef } from "react";
import { onSidecarEvent, injectText, type SidecarMessage } from "../lib/tauri";
import { useAppStore, type RecordingState } from "../stores/appStore";
import { insertTranscription, updateMetrics } from "../lib/db";

export const useDownloadProgress = () => useAppStore((s) => s.downloadProgress);
export const useDownloadModel    = () => useAppStore((s) => s.downloadModel);

export function useSidecar() {
  const {
    setSidecarReady,
    setModelReady,
    setRecordingState,
    appendWord,
    commitSegment,
    setTier,
    setModel,
    setDownloadProgress,
  } = useAppStore();

  const dictationStartMs = useRef<number | null>(null);

  useEffect(() => {
    const unlisten = onSidecarEvent((msg: SidecarMessage) => {
      switch (msg.event) {
        case "ready":
          setSidecarReady(true);
          break;

        case "word":
          if (dictationStartMs.current === null) {
            dictationStartMs.current = Date.now();
          }
          setRecordingState("recording");
          appendWord(msg.text);
          break;

        case "segment_done": {
          const raw = msg.text;
          commitSegment(raw);

          if (raw.trim()) {
            const durationMs = dictationStartMs.current
              ? Date.now() - dictationStartMs.current
              : 0;
            dictationStartMs.current = null;

            const currentModel = useAppStore.getState().model ?? "";
            const currentTier  = useAppStore.getState().tier  ?? "";

            localStorage.setItem("sotto_last_transcription", raw);
            navigator.clipboard.writeText(raw).catch(() => {});

            // inject_text Rust command emits "inject-done" to all windows after completing
            injectText(raw).catch((e) => console.warn("[inject_text]", e));

            insertTranscription(raw, currentModel, currentTier, durationMs);
            updateMetrics(raw.trim().split(/\s+/).length, durationMs);
          }
          break;
        }

        case "status": {
          const statusMap: Record<string, RecordingState> = {
            recording_ptt:  "recording",
            handsfree_ptt:  "recording",
            recording:      "recording",
            processing:     "processing",
            loading_model:  "loading",
            idle:           "idle",
          };
          const state = statusMap[msg.msg] ?? "idle";
          if (state === "recording" && dictationStartMs.current === null) {
            dictationStartMs.current = Date.now();
          }
          setRecordingState(state);
          // Track model load lifecycle
          if (msg.msg === "idle") setModelReady(true);
          else if (msg.msg === "loading_model") setModelReady(false);
          break;
        }

        case "hardware":
          setTier(msg.tier as any);
          setModel(msg.model);
          localStorage.setItem("sotto_tier", msg.tier);
          localStorage.setItem("sotto_model", msg.model);
          break;

        case "download_progress": {
          const pct = (msg as any).percent as number;
          const mdl = (msg as any).model as string;
          setDownloadProgress(mdl, pct);
          if (pct >= 100) setTimeout(() => setDownloadProgress(null, null), 1000);
          break;
        }

        case "error":
          console.error("[sidecar]", msg.msg);
          // Always reset to idle on any error — prevents stuck "Processing..." state
          setRecordingState("idle");
          // If the sidecar crashed, model needs to reload on respawn
          if (msg.msg === "sidecar_crashed") setModelReady(false);
          break;

        default:
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setSidecarReady, setModelReady, setRecordingState, appendWord, commitSegment, setTier, setModel]);
}
