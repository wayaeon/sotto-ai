import { create } from "zustand";

export type RecordingState = "idle" | "recording" | "processing" | "loading";
export type ModelTier = "tier1" | "tier2" | "tier3_en" | "tier3_ml" | "tier4";

export interface FocusedApp {
  name: string;
  iconDataUri: string | null;
  kind: "app" | "site";
}

interface AppState {
  recordingState: RecordingState;
  streamingWords: string;
  lastSegment: string;
  sidecarReady: boolean;
  modelReady: boolean;   // true only after first status:idle (model fully loaded)
  tier: ModelTier | null;
  model: string | null;
  setupComplete: boolean;
  lastError: string | null;   // last sidecar error — drives the orb's error state
  handsFreeActive: boolean;   // true while hands-free is armed, even between utterances
  focusedApp: FocusedApp | null;       // app/site currently focused, live
  lastDictationApp: FocusedApp | null; // app/site the most recently *completed* dictation went into
  lastDictationStats: { wordCount: number; durationMs: number } | null;

  setRecordingState: (s: RecordingState) => void;
  appendWord: (word: string) => void;
  commitSegment: (text: string) => void;
  setSidecarReady: (ready: boolean) => void;
  setModelReady: (ready: boolean) => void;
  setTier: (tier: ModelTier) => void;
  setModel: (model: string) => void;
  setSetupComplete: (done: boolean) => void;
  setLastError: (msg: string | null) => void;
  setHandsFreeActive: (active: boolean) => void;
  setFocusedApp: (app: FocusedApp | null) => void;
  setLastDictationApp: (app: FocusedApp | null) => void;
  setLastDictationStats: (stats: { wordCount: number; durationMs: number } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  recordingState: "idle",
  streamingWords: "",
  lastSegment: "",
  sidecarReady: false,
  modelReady: false,
  tier: null,
  model: null,
  setupComplete: false,
  lastError: null,
  handsFreeActive: false,
  focusedApp: null,
  lastDictationApp: null,
  lastDictationStats: null,

  setRecordingState: (s) => set({ recordingState: s }),
  appendWord: (word) =>
    set((state) => ({
      streamingWords: state.streamingWords ? state.streamingWords + " " + word : word,
    })),
  commitSegment: (text) =>
    set({ lastSegment: text, streamingWords: "", recordingState: "idle" }),
  setSidecarReady: (ready) => set({ sidecarReady: ready }),
  setModelReady: (ready) => set({ modelReady: ready }),
  setTier: (tier) => set({ tier }),
  setModel: (model) => set({ model }),
  setSetupComplete: (done) => set({ setupComplete: done }),
  setLastError: (msg) => set({ lastError: msg }),
  setHandsFreeActive: (active) => set({ handsFreeActive: active }),
  setFocusedApp: (app) => set({ focusedApp: app }),
  setLastDictationApp: (app) => set({ lastDictationApp: app }),
  setLastDictationStats: (stats) => set({ lastDictationStats: stats }),
}));
