import { useAppStore } from "../stores/appStore";
import { setModel as setModelIpc, toggleHandsfree } from "../lib/tauri";

/**
 * The Orb — the single hero of the Talk surface (DESIGN.md §3).
 * A status display and a button at once: its state IS the app state.
 * It never moves; states crossfade in place.
 */

export type OrbState = "loading" | "ready" | "recording" | "processing" | "error";

export function useOrbState(): { state: OrbState; detail: string } {
  const { recordingState, modelReady, model, lastError } = useAppStore();

  if (lastError && recordingState === "idle") {
    return { state: "error", detail: lastError };
  }
  switch (recordingState) {
    case "recording":  return { state: "recording", detail: "Listening…" };
    case "processing": return { state: "processing", detail: "Transcribing…" };
    case "loading":    return { state: "loading", detail: `Loading ${shortModel(model)}…` };
    default:
      return modelReady
        ? { state: "ready", detail: "Start dictating" }
        : { state: "loading", detail: `Loading ${shortModel(model)}…` };
  }
}

function shortModel(model: string | null): string {
  if (!model) return "model";
  const tail = model.split("/").pop() ?? model;
  return tail.length > 28 ? tail.slice(0, 28) + "…" : tail;
}

export default function Orb() {
  const { state, detail } = useOrbState();
  const setLastError = useAppStore((s) => s.setLastError);
  const model = useAppStore((s) => s.model);

  const onClick = () => {
    if (state === "error") {
      // Retry: clear the error and re-request the current model
      setLastError(null);
      if (model) setModelIpc(model).catch(console.error);
      return;
    }
    if (state === "ready" || state === "recording") {
      toggleHandsfree().catch(console.error);
    }
  };

  return (
    <div className="talk-stage">
      <button
        className="orb"
        data-state={state}
        onClick={onClick}
        aria-label={state === "error" ? "Retry model load" : "Toggle hands-free dictation"}
      >
        <span className="orb-ring" />
        <span className="orb-core">
          {state === "recording" ? (
            <span className="orb-wave" aria-hidden>
              <i /><i /><i /><i /><i />
            </span>
          ) : state === "error" ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 8v5" /><circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
            </svg>
          )}
        </span>
      </button>

      <div className="orb-label" data-state={state}>{detail}</div>
      {state === "ready" && (
        <div className="orb-hint">
          or hold <kbd>Ctrl</kbd> + <kbd>Win</kbd> in any app
        </div>
      )}
      {state === "error" && (
        <div className="orb-hint">click to retry</div>
      )}
    </div>
  );
}
