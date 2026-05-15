import { useEffect, useRef } from "react";
import { onSidecarEvent, injectText, type SidecarMessage } from "../lib/tauri";
import { useAppStore, type RecordingState } from "../stores/appStore";
import { insertTranscription, updateMetrics } from "../lib/db";

export function useSidecar() {
  const {
    setSidecarReady,
    setRecordingState,
    appendWord,
    commitSegment,
    setTier,
    setModel,
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
          const text = msg.cleanup_text ?? msg.text;
          commitSegment(text);

          if (text.trim()) {
            const durationMs = dictationStartMs.current
              ? Date.now() - dictationStartMs.current
              : 0;
            dictationStartMs.current = null;

            // Inject into active window
            injectText(text).catch((e) =>
              console.warn("[inject_text]", e)
            );

            // Save + update metrics
            const wordCount = text.trim().split(/\s+/).length;
            const currentModel = useAppStore.getState().model ?? "";
            const currentTier = useAppStore.getState().tier ?? "";
            insertTranscription(text, currentModel, currentTier, durationMs);
            updateMetrics(wordCount, durationMs);
          }
          break;
        }

        case "status": {
          const statusMap: Record<string, RecordingState> = {
            recording_ptt: "recording",
            handsfree_ptt: "recording",
            recording: "recording",
            processing: "processing",
            idle: "idle",
          };
          const state = statusMap[msg.msg] ?? "idle";
          if (state === "recording" && dictationStartMs.current === null) {
            dictationStartMs.current = Date.now();
          }
          setRecordingState(state);
          break;
        }

        case "hardware":
          setTier(msg.tier as any);
          setModel(msg.model);
          localStorage.setItem("sotto_tier", msg.tier);
          localStorage.setItem("sotto_model", msg.model);
          break;

        case "error":
          console.error("[sidecar]", msg.msg);
          break;

        default:
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setSidecarReady, setRecordingState, appendWord, commitSegment, setTier, setModel]);
}
