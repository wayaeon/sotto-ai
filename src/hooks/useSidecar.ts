import { useEffect } from "react";
import { onSidecarEvent, type SidecarMessage } from "../lib/tauri";
import { useAppStore, type RecordingState } from "../stores/appStore";

export function useSidecar() {
  const {
    setSidecarReady,
    setRecordingState,
    appendWord,
    commitSegment,
    setTier,
    setModel,
  } = useAppStore();

  useEffect(() => {
    const unlisten = onSidecarEvent((msg: SidecarMessage) => {
      switch (msg.event) {
        case "ready":
          setSidecarReady(true);
          break;
        case "word":
          setRecordingState("recording");
          appendWord(msg.text);
          break;
        case "segment_done": {
          const text = msg.cleanup_text ?? msg.text;
          commitSegment(text);
          break;
        }
        case "status": {
          const statusMap: Record<string, RecordingState> = {
            recording_ptt: "recording",
            handsfree_ptt: "recording",
            processing: "processing",
            idle: "idle",
          };
          const state = statusMap[msg.msg] ?? "idle";
          setRecordingState(state);
          break;
        }
        case "hardware":
          setTier(msg.tier as any);
          setModel(msg.model);
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
