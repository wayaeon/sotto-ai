import { useEffect, useRef } from "react";
import { cloudFormat, onSidecarEvent, onFocusedApp, onExternalContext, injectText, type SidecarMessage } from "../lib/tauri";
import { useAppStore, type ExternalContext, type FocusedApp, type RecordingState } from "../stores/appStore";
import { insertTranscription, updateMetrics, updateTranscription } from "../lib/db";
import { formatForContext, resolveContextProfile } from "../lib/contextFormatting";

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
    setAudioLevel,
    appendWord,
    commitSegment,
    setTier,
    setModel,
    setHandsFreeActive,
    setWakePhraseActive,
    setFocusedApp,
    setExternalContext,
    setLastDictationApp,
    setLastDictationStats,
  } = useAppStore();

  const dictationStartMs = useRef<number | null>(null);
  const dictationTarget = useRef<FocusedApp | null>(null);
  const dictationContext = useRef<ExternalContext | null>(null);

  // Separate listener/effect — this event comes straight from Rust, not
  // through the sidecar's JSON-lines protocol like everything else here.
  useEffect(() => {
    const unlisten = onFocusedApp((app) => {
      const target = { name: app.name, iconDataUri: app.icon_data_uri, kind: app.kind } as FocusedApp;
      setFocusedApp(target);
      if (dictationStartMs.current !== null) dictationTarget.current = target;
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [setFocusedApp]);

  useEffect(() => {
    const unlisten = onExternalContext((context) => {
      setExternalContext(context);
      if (dictationStartMs.current !== null) dictationContext.current = context;
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [setExternalContext]);

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
          const rawTextBeforeFilter = msg.raw_text ?? null;
          const dictatedInto = dictationTarget.current ?? useAppStore.getState().focusedApp;
          const context = dictationContext.current;
          const profile = resolveContextProfile(dictatedInto, context);
          const formatted = formatForContext(raw, profile);

          const durationMs = dictationStartMs.current
            ? Date.now() - dictationStartMs.current
            : 0;
          dictationStartMs.current = null;
          dictationTarget.current = null;
          dictationContext.current = null;

          const finish = (finalText: string): number | null => {
            commitSegment(finalText);
            if (finalText.trim()) {
            setLastDictationApp(dictatedInto);
              setLastDictationStats({ wordCount: finalText.trim().split(/\s+/).length, durationMs });
            }

            if (finalText.trim() && primary) {
              const currentModel = useAppStore.getState().model ?? "";
              const currentTier  = useAppStore.getState().tier  ?? "";
              const destination = useAppStore.getState().lastDictationApp;

              localStorage.setItem("verba_last_transcription", finalText);

              injectText(finalText).catch((e) => console.warn("[inject_text]", e));

              const entry = insertTranscription(
                finalText, currentModel, currentTier, durationMs,
                destination?.name ?? null, destination?.iconDataUri ?? null,
                rawTextBeforeFilter
              );
              updateMetrics(finalText.trim().split(/\s+/).length, durationMs);
              return entry.id;
            }
            return null;
          };

          if (!primary || !formatted.trim()) {
            finish(formatted);
            break;
          }

          const entryId = finish(formatted);

          void cloudFormat({
            text: formatted,
            profile,
            app: dictatedInto?.name,
            site: context?.site,
            field: context?.field,
            activeFile: context?.activeFile,
          })
            .then((cloudText) => {
              const polished = cloudText.trim();
              if (entryId !== null && polished && polished !== formatted) {
                updateTranscription(entryId, polished);
              }
            })
            .catch(() => {});
          break;
        }

        case "status": {
          const statusMap: Record<string, RecordingState> = {
            recording_ptt:  "recording",
            handsfree_ptt:  "recording",
            wake_dictating: "recording",
            recording:      "recording",
            processing:     "processing",
            loading_model:  "loading",
            idle:           "idle",
          };
          const state = statusMap[msg.msg] ?? "idle";
          if (state === "recording" && dictationStartMs.current === null) {
            dictationStartMs.current = Date.now();
            dictationTarget.current = useAppStore.getState().focusedApp;
            dictationContext.current = useAppStore.getState().externalContext;
          }
          setRecordingState(state);
          if (state === "idle") setAudioLevel(0);
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
          else if (msg.msg === "wake_armed" || msg.msg === "wake_detected" || msg.msg === "wake_dictating") setWakePhraseActive(true);
          else if (msg.msg === "wake_off") setWakePhraseActive(false);
          break;
        }

        case "hardware":
          setTier(msg.tier as any);
          // Tier is informational only — never overwrite the user's model choice.
          localStorage.setItem("verba_tier", msg.tier);
          break;

        case "audio_level":
          setAudioLevel(msg.level);
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
  }, [setSidecarReady, setModelReady, setRecordingState, setAudioLevel, appendWord, commitSegment, setTier, setModel, setHandsFreeActive, setWakePhraseActive, setLastDictationApp, setLastDictationStats]);
}
