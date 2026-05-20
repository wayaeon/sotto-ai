import { useEffect, useRef } from "react";
import { onSidecarEvent, injectText, type SidecarMessage } from "../lib/tauri";
import { useAppStore, type RecordingState } from "../stores/appStore";
import { insertTranscription, updateMetrics } from "../lib/db";

export const useDownloadProgress = () => useAppStore((s) => s.downloadProgress);
export const useDownloadModel    = () => useAppStore((s) => s.downloadModel);

async function ollamaCleanup(raw: string): Promise<string> {
  const enabled = localStorage.getItem("sotto_llm_enabled") === "true";
  if (!enabled) return raw;

  const url   = localStorage.getItem("sotto_llm_url")   ?? "http://localhost:11434";
  const model = localStorage.getItem("sotto_llm_model") ?? "qwen3:7b";
  const sysprompt = localStorage.getItem("sotto_llm_prompt") ??
    "Clean up the following voice transcription. Fix punctuation, capitalisation, and obvious speech errors. Return only the corrected text, nothing else.";

  try {
    const res = await fetch(`${url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: `${sysprompt}\n\n${raw}`, stream: false }),
    });
    if (!res.ok) return raw;
    const data = await res.json();
    return (data.response as string)?.trim() || raw;
  } catch {
    return raw;
  }
}

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
          const raw = msg.cleanup_text ?? msg.text;
          commitSegment(raw);

          if (raw.trim()) {
            const durationMs = dictationStartMs.current
              ? Date.now() - dictationStartMs.current
              : 0;
            dictationStartMs.current = null;

            const currentModel = useAppStore.getState().model ?? "";
            const currentTier  = useAppStore.getState().tier  ?? "";

            ollamaCleanup(raw).then((text) => {
              localStorage.setItem("sotto_last_transcription", text);
              // Always copy to clipboard
              navigator.clipboard.writeText(text).catch(() => {});
              // Inject into active text field if possible
              injectText(text).catch((e) => console.warn("[inject_text]", e));
              insertTranscription(text, currentModel, currentTier, durationMs);
              updateMetrics(text.trim().split(/\s+/).length, durationMs);
            });
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
