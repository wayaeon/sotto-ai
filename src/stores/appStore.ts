import { create } from "zustand";

export type RecordingState = "idle" | "recording" | "processing" | "loading";
export type ModelTier = "tier1" | "tier2" | "tier3_en" | "tier3_ml" | "tier4";

interface AppState {
  recordingState: RecordingState;
  streamingWords: string;
  lastSegment: string;
  sidecarReady: boolean;
  modelReady: boolean;   // true only after first status:idle (model fully loaded)
  tier: ModelTier | null;
  model: string | null;
  setupComplete: boolean;
  downloadProgress: number | null;   // 0-100, null = not downloading
  downloadModel: string | null;

  setRecordingState: (s: RecordingState) => void;
  appendWord: (word: string) => void;
  commitSegment: (text: string) => void;
  setSidecarReady: (ready: boolean) => void;
  setModelReady: (ready: boolean) => void;
  setTier: (tier: ModelTier) => void;
  setModel: (model: string) => void;
  setSetupComplete: (done: boolean) => void;
  setDownloadProgress: (model: string | null, pct: number | null) => void;
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
  downloadProgress: null,
  downloadModel: null,

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
  setDownloadProgress: (model, pct) => set({ downloadModel: model, downloadProgress: pct }),
}));
