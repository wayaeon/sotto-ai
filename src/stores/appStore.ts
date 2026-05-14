import { create } from "zustand";

export type RecordingState = "idle" | "recording" | "processing";
export type ModelTier = "tier1" | "tier2" | "tier3_en" | "tier3_ml" | "tier4";

interface AppState {
  recordingState: RecordingState;
  streamingWords: string;
  lastSegment: string;
  sidecarReady: boolean;
  tier: ModelTier | null;
  model: string | null;
  setupComplete: boolean;

  setRecordingState: (s: RecordingState) => void;
  appendWord: (word: string) => void;
  commitSegment: (text: string) => void;
  setSidecarReady: (ready: boolean) => void;
  setTier: (tier: ModelTier) => void;
  setModel: (model: string) => void;
  setSetupComplete: (done: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  recordingState: "idle",
  streamingWords: "",
  lastSegment: "",
  sidecarReady: false,
  tier: null,
  model: null,
  setupComplete: false,

  setRecordingState: (s) => set({ recordingState: s }),
  appendWord: (word) =>
    set((state) => ({
      streamingWords: state.streamingWords ? state.streamingWords + " " + word : word,
    })),
  commitSegment: (text) =>
    set({ lastSegment: text, streamingWords: "", recordingState: "idle" }),
  setSidecarReady: (ready) => set({ sidecarReady: ready }),
  setTier: (tier) => set({ tier }),
  setModel: (model) => set({ model }),
  setSetupComplete: (done) => set({ setupComplete: done }),
}));
