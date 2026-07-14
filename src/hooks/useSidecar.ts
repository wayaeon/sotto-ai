import { useEffect, useRef } from "react";
import { onSidecarEvent, onFocusedApp, injectText, setModel as setModelIpc, type SidecarMessage } from "../lib/tauri";
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
    setHandsFreeActive,
    setFocusedApp,
    setLastDictationApp,
    setLastDictationStats,
  } = useAppStore();

  const dictationStartMs = useRef<number | null>(null);

  // Separate listener/effect — this event comes straight from Rust, not
  // through the sidecar's JSON-lines protocol like everything else here.
  useEffect(() => {
    const unlisten = onFocusedApp((app) => {
      setFocusedApp({ name: app.name, iconDataUri: app.icon_data_uri, kind: app.kind });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [setFocusedApp]);

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

          const durationMs = dictationStartMs.current
            ? Date.now() - dictationStartMs.current
            : 0;
          dictationStartMs.current = null;

          // Runs in every window (each has its own store — sidecar-event
          // broadcasts to all of them, so this is how they stay in sync
          // instead of only the Pill knowing what was just dictated).
          if (raw.trim()) {
            // Snapshot now — focusedApp reflects whatever was focused when this
            // utterance *started*; by the time segment_done fires the user may
            // have already switched windows, so this pins it to the right one.
            const dictatedInto = useAppStore.getState().focusedApp;
            setLastDictationApp(dictatedInto);
            setLastDictationStats({ wordCount: raw.trim().split(/\s+/).length, durationMs });
          }

          // Injection/history/metrics run only in the primary (Pill)
          // instance, to avoid double-injecting and duplicate history rows.
          if (raw.trim() && primary) {
            const currentModel = useAppStore.getState().model ?? "";
            const currentTier  = useAppStore.getState().tier  ?? "";
            const dictatedInto = useAppStore.getState().lastDictationApp;

            localStorage.setItem("verba_last_transcription", raw);

            // inject_text Rust command emits "inject-done" to all windows after completing
            injectText(raw).catch((e) => console.warn("[inject_text]", e));

            insertTranscription(
              raw, currentModel, currentTier, durationMs,
              dictatedInto?.name ?? null, dictatedInto?.iconDataUri ?? null
            );
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
          // Hands-free stays armed between utterances — track it separately
          // from recordingState so the UI can show it's still listening.
          else if (msg.msg === "handsfree_on") setHandsFreeActive(true);
          else if (msg.msg === "handsfree_off") setHandsFreeActive(false);
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
  }, [setSidecarReady, setModelReady, setRecordingState, appendWord, commitSegment, setTier, setModel, setHandsFreeActive, setLastDictationApp, setLastDictationStats]);
}
