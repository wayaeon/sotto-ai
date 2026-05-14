import { useCallback } from "react";
import { startPtt, stopPtt, toggleHandsfree, detectHardware } from "../lib/tauri";
import { useAppStore } from "../stores/appStore";

export function useTranscription() {
  const { recordingState, streamingWords } = useAppStore();

  const handleStartPtt = useCallback(async () => {
    await startPtt();
  }, []);

  const handleStopPtt = useCallback(async () => {
    await stopPtt();
  }, []);

  const handleToggleHandsfree = useCallback(async () => {
    await toggleHandsfree();
  }, []);

  const handleDetectHardware = useCallback(async () => {
    await detectHardware();
  }, []);

  return {
    recordingState,
    streamingWords,
    startPtt: handleStartPtt,
    stopPtt: handleStopPtt,
    toggleHandsfree: handleToggleHandsfree,
    detectHardware: handleDetectHardware,
  };
}
