import { useEffect, useRef } from "react";
import { onSidecarEvent, injectText, setModel as setModelIpc, type SidecarMessage } from "../lib/tauri";
import { useAppStore, type RecordingState } from "../stores/appStore";
import { insertTranscription, updateMetrics } from "../lib/db";

// Single source of truth for the default model.
// Always parakeet TDT v3 — ONNX runtime, works on any hardware.
const DEFAULT_MODEL = "nvidia/parakeet-tdt-0.6b-v3";

/**
 * primary: true  → Pill window only. Handles injection, history, metrics.
 * primary: false → Home/other windows. State updates only, no side effects.
 *
 * Without this flag, useSidecar running in two windows causes double injection
 * and duplicate history entries because sidecar-event broadcasts to all windows.
 */
export function useSidecar({ primary = false }: { primary?: boolean } = {}) {
  const {
    setSidecarReady,
    setModelReady,
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
          {
            // Models are pre-installed — there's no user-facing picker anymore, so
            // startup always loads DEFAULT_MODEL. (Previously this fell back to a
            // `verba_model` value cached in localStorage, but a value written before
            // the model catalog's defaults changed would silently pin the app to a
            // stale, worse model forever with no UI to fix it.)
            localStorage.setItem("verba_model", DEFAULT_MODEL);
            setModel(DEFAULT_MODEL);
            setModelIpc(DEFAULT_MODEL).catch((e) => console.warn("[set_model]", e));
          }
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

          // Side effects run only in the primary (Pill) instance
          if (raw.trim() && primary) {
            const durationMs = dictationStartMs.current
              ? Date.now() - dictationStartMs.current
              : 0;
            dictationStartMs.current = null;

            const currentModel = useAppStore.getState().model ?? "";
            const currentTier  = useAppStore.getState().tier  ?? "";

            localStorage.setItem("verba_last_transcription", raw);

            // inject_text Rust command emits "inject-done" to all windows after completing
            injectText(raw).catch((e) => console.warn("[inject_text]", e));

            insertTranscription(raw, currentModel, currentTier, durationMs);
            updateMetrics(raw.trim().split(/\s+/).length, durationMs);
          } else if (!primary) {
            // Non-primary: still reset the timer so state stays consistent
            dictationStartMs.current = null;
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
          // A successful state transition clears any prior error
          if (msg.msg === "recording_ptt" || msg.msg.startsWith("worker_ready")) {
            useAppStore.getState().setLastError(null);
          }
          // Track model load lifecycle
          if (msg.msg === "idle") setModelReady(true);
          else if (msg.msg === "loading_model") setModelReady(false);
          else if (msg.msg.startsWith("worker_ready")) {
            const parts = Object.fromEntries(
              msg.msg.split(" ").slice(1).map((p) => p.split("="))
            );
            if (parts.model) {
              setModel(parts.model);
              localStorage.setItem("verba_model", parts.model);
            }
            setModelReady(true);
          }
          else if (msg.msg.startsWith("model_selected")) {
            const parts = Object.fromEntries(
              msg.msg.split(" ").slice(1).map((p) => p.split("="))
            );
            if (parts.model) {
              setModel(parts.model);
              localStorage.setItem("verba_model", parts.model);
            }
          }
          break;
        }

        case "hardware":
          setTier(msg.tier as any);
          // Tier is informational only — never overwrite the user's model choice.
          localStorage.setItem("verba_tier", msg.tier);
          break;

        case "error":
          console.error("[sidecar]", msg.msg);
          // Always reset to idle on any error — prevents stuck "Processing..." state
          setRecordingState("idle");
          useAppStore.getState().setLastError(msg.msg);
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
