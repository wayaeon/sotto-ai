import { create } from "zustand";

export type RecordingState = "idle" | "recording" | "processing" | "loading";
export type ModelTier = "tier1" | "tier2" | "tier3_en" | "tier3_ml" | "tier4";

export interface FocusedApp {
  name: string;
  iconDataUri: string | null;
  kind: "app" | "site";
}

export interface ExternalContext {
  source: "browser" | "cursor";
  app: string;
  site?: string;
  field?: "email" | "compose" | "text" | "code";
  activeFile?: string;
}

export interface ModelDownload {
  percent: number;
  bytesDownloaded: number;
  bytesTotal: number;
  downloadedLabel: string;
  totalLabel: string;
}

export interface DownloadState {
  downloaded: boolean;
  active: boolean;
  paused: boolean;
  percent?: number;
}

interface AppState {
  recordingState: RecordingState;
  audioLevel: number;
  streamingWords: string;
  lastSegment: string;
  sidecarReady: boolean;
  modelReady: boolean;   // true only after first status:idle (model fully loaded)
  tier: ModelTier | null;
  model: string | null;
  modelDownload: ModelDownload | null;
  downloadStates: Record<string, DownloadState>;
  setupComplete: boolean;
  lastError: string | null;   // last sidecar error — drives the orb's error state
  handsFreeActive: boolean;   // true while hands-free is armed, even between utterances
  wakePhraseActive: boolean;
  wakePhraseStatus: "off" | "armed" | "hearing" | "detected" | "dictating";
  tabletPosture: "tablet" | "laptop";
  focusedApp: FocusedApp | null;       // app/site currently focused, live
  externalContext: ExternalContext | null;
  lastDictationApp: FocusedApp | null; // app/site the most recently *completed* dictation went into
  lastDictationStats: { wordCount: number; durationMs: number } | null;

  setRecordingState: (s: RecordingState) => void;
  setAudioLevel: (level: number) => void;
  appendWord: (word: string) => void;
  commitSegment: (text: string) => void;
  setSidecarReady: (ready: boolean) => void;
  setModelReady: (ready: boolean) => void;
  setTier: (tier: ModelTier) => void;
  setModel: (model: string) => void;
  setModelDownload: (download: ModelDownload | null) => void;
  setDownloadStates: (states: Record<string, DownloadState>) => void;
  setSetupComplete: (done: boolean) => void;
  setLastError: (msg: string | null) => void;
  setHandsFreeActive: (active: boolean) => void;
  setWakePhraseActive: (active: boolean) => void;
  setWakePhraseStatus: (status: AppState["wakePhraseStatus"]) => void;
  setTabletPosture: (posture: AppState["tabletPosture"]) => void;
  setFocusedApp: (app: FocusedApp | null) => void;
  setExternalContext: (context: ExternalContext | null) => void;
  setLastDictationApp: (app: FocusedApp | null) => void;
  setLastDictationStats: (stats: { wordCount: number; durationMs: number } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  recordingState: "idle",
  audioLevel: 0,
  streamingWords: "",
  lastSegment: "",
  sidecarReady: false,
  modelReady: false,
  tier: null,
  model: null,
  modelDownload: null,
  downloadStates: {},
  setupComplete: false,
  lastError: null,
  handsFreeActive: false,
  wakePhraseActive: false,
  wakePhraseStatus: "off",
  tabletPosture: "laptop",
  focusedApp: null,
  externalContext: null,
  lastDictationApp: null,
  lastDictationStats: null,

  setRecordingState: (s) => set({ recordingState: s }),
  setAudioLevel: (level) => set({ audioLevel: level }),
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
  setModelDownload: (modelDownload) => set({ modelDownload }),
  setDownloadStates: (downloadStates) => set({ downloadStates }),
  setSetupComplete: (done) => set({ setupComplete: done }),
  setLastError: (msg) => set({ lastError: msg }),
  setHandsFreeActive: (active) => set({ handsFreeActive: active }),
  setWakePhraseActive: (active) => set({ wakePhraseActive: active }),
  setWakePhraseStatus: (wakePhraseStatus) => set({ wakePhraseStatus }),
  setTabletPosture: (tabletPosture) => set({ tabletPosture }),
  setFocusedApp: (app) => set({ focusedApp: app }),
  setExternalContext: (context) => set({ externalContext: context }),
  setLastDictationApp: (app) => set({ lastDictationApp: app }),
  setLastDictationStats: (stats) => set({ lastDictationStats: stats }),
}));
